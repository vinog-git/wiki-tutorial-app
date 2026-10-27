# AWS: ECS (Elastic Container Service)

**Amazon ECS** is AWS's own container orchestrator. You describe a container in a **task definition**, run it as a **service** on a **cluster**, and ECS keeps the desired number of tasks running, registers them with a load balancer, and rolls out new versions. It is simpler than Kubernetes and deeply integrated with AWS IAM, ALB, CloudWatch and Service Connect. Choose ECS when you want less to operate; choose EKS when you need Kubernetes APIs or its ecosystem.

## Core concepts

| Term | Meaning | Kubernetes equivalent |
|---|---|---|
| **Cluster** | Logical group of capacity (Fargate, EC2 instances, or both) | Cluster / node pool |
| **Task definition** | Blueprint: image, CPU, memory, ports, env, IAM roles, logs | Pod spec |
| **Task** | A running instance of a task definition | Pod |
| **Service** | Keeps N tasks running, does rollouts, attaches to a load balancer | Deployment + Service |
| **Container instance** | An EC2 host registered to the cluster (EC2 launch type only) | Node |
| **Capacity provider** | Strategy for mixing Fargate and EC2 capacity | Node autoscaling |

## Launch types

| | Fargate | EC2 |
|---|---|---|
| Servers to manage | None | You manage instances, AMIs and patching |
| Billing | Per vCPU and GB-second of task | Per instance |
| Startup | Seconds | Depends on instance capacity |
| Customisation | Limited (no privileged, no GPU in most cases) | Full host control, GPUs, daemon sidecars |
| Good for | Most web services and workers | Large steady workloads, cost tuning with Spot, GPUs |

Default to **Fargate** unless you need host-level features.

## Task definition

This example runs an orders API on Fargate, with the task role for app permissions, the execution role for ECS itself, and logs to CloudWatch:

```json
{
  "family": "orders-service",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "512",
  "memory": "1024",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/orders-task-role",
  "containerDefinitions": [
    {
      "name": "orders",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service:a1b2c3d",
      "essential": true,
      "portMappings": [
        { "containerPort": 8080, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "SPRING_PROFILES_ACTIVE", "value": "prod" }
      ],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/orders/db-AbCdEf:password::"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/actuator/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/orders-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "orders"
        }
      }
    }
  ]
}
```

Two roles, two jobs:

| Role | Used by | Grants |
|---|---|---|
| **Task execution role** | ECS agent | Pull image from ECR, write logs, read secrets referenced in `secrets` |
| **Task role** | Your application code | The AWS calls your app makes: S3, SQS, DynamoDB |

Mixing these up is the most common ECS interview question.

### Register it

```bash
aws ecs register-task-definition --cli-input-json file://orders-task.json \
  --query "taskDefinition.taskDefinitionArn" --output text
```

```output
arn:aws:ecs:us-east-1:123456789012:task-definition/orders-service:7
```

Every registration creates a new revision (`:7`). Services reference a family or a specific revision.

## Cluster

```bash
aws ecs create-cluster --cluster-name prod \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
  --settings name=containerInsights,value=enabled
```

## Service with an Application Load Balancer

A service keeps tasks running, spreads them across subnets, and registers them with a target group. Fargate tasks need `target-type ip`.

```bash
aws ecs create-service \
  --cluster prod \
  --service-name orders \
  --task-definition orders-service:7 \
  --desired-count 3 \
  --launch-type FARGATE \
  --enable-execute-command \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0ddd3333eee44444f,subnet-0eee4444fff55555a],securityGroups=[sg-0app00000000000b],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/orders/abc123,containerName=orders,containerPort=8080" \
  --health-check-grace-period-seconds 60 \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}"
```

```output
{
    "service": {
        "serviceName": "orders",
        "status": "ACTIVE",
        "desiredCount": 3,
        "runningCount": 0,
        "pendingCount": 3,
        "deployments": [ { "status": "PRIMARY", "rolloutState": "IN_PROGRESS" } ]
    }
}
```

Important settings:

- **`minimumHealthyPercent=100` and `maximumPercent=200`** start new tasks before stopping old ones, for zero-downtime rollouts.
- **Deployment circuit breaker** stops and rolls back a deployment whose tasks keep failing.
- **Health check grace period** gives slow-starting apps time before the ALB marks them unhealthy.
- **`--enable-execute-command`** allows `aws ecs execute-command` to open a shell in a task for debugging, which requires the task role to allow `ssmmessages` actions.

## Deploy a new version

Register a new task definition revision with the new image tag, then point the service at it:

```bash
# Update the image in the task definition JSON, then:
NEW_REV=$(aws ecs register-task-definition --cli-input-json file://orders-task.json \
  --query "taskDefinition.revision" --output text)

aws ecs update-service --cluster prod --service orders \
  --task-definition orders-service:$NEW_REV --force-new-deployment

aws ecs wait services-stable --cluster prod --services orders
echo "Deployed revision $NEW_REV"
```

For blue/green deployments with traffic shifting and automatic rollback on alarms, use the **CodeDeploy** deployment controller on the service.

## Autoscaling

Application Auto Scaling scales the service's `desiredCount` on a target:

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/prod/orders \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 20

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/prod/orders \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-70 \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
  '{"TargetValue":70,"PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"}}'
```

Scale on queue depth for workers: a target tracking policy on a custom CloudWatch metric such as "messages per task".

## Service Connect and service discovery

Services in the same cluster can call each other by name. **Service Connect** handles this with a built-in proxy and load balancing, and **Cloud Map** provides DNS-based discovery. Use Service Connect for service-to-service calls inside ECS; use the ALB for traffic from outside.

## Logs and debugging

```bash
aws ecs list-tasks --cluster prod --service-name orders
aws ecs describe-services --cluster prod --services orders \
  --query "services[0].events[0:5].message" --output table
aws ecs execute-command --cluster prod --task <task-id> \
  --container orders --interactive --command "/bin/sh"
aws logs tail /ecs/orders-service --follow
```

Common failures:

| Symptom | Likely cause |
|---|---|
| `CannotPullContainerError` | Execution role missing ECR permissions, or no route to ECR (NAT or endpoints) |
| `ResourceInitializationError` on secrets | Execution role cannot read the Secrets Manager secret |
| Tasks start then stop with exit 137 | Out of memory; raise the task memory |
| Targets unhealthy in ALB | Health check path wrong, or security group does not allow the ALB |
| Tasks stuck `PROVISIONING` | No subnet IPs left, or Fargate capacity unavailable in that AZ |

## Pricing notes

- Fargate bills vCPU and memory per second, with a one-minute minimum.
- Fargate Spot is up to 70% cheaper and can be interrupted; use it for stateless workers.
- Compute Savings Plans apply to Fargate as well as Lambda and EC2.

## Key takeaways

- Task definition = blueprint; task = running copy; service = keeps N tasks running and deploys them.
- Execution role pulls images and writes logs; task role is what your code can call.
- Use Fargate by default, and awsvpc networking with one security group per service.
- Use a circuit breaker, a health check grace period and rolling settings for safe deployments.
- Compare with EKS when you need Kubernetes APIs, Helm, or portability.
