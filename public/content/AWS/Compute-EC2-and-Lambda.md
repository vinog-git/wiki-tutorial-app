# AWS: Compute (EC2, Auto Scaling, Lambda)

AWS offers compute at several levels of abstraction. The less you manage, the less you control, and the faster you ship.

| Level | Service | You manage |
|---|---|---|
| Virtual machines | **EC2** | OS, patches, runtime, app, scaling |
| Managed containers | **ECS on Fargate**, **EKS** | Container images, task or pod config |
| Functions | **Lambda** | Code and configuration only |
| Managed PaaS | **Elastic Beanstalk**, **App Runner** | Code and container; platform hidden |

## EC2

### Key choices

| Choice | Options | Guidance |
|---|---|---|
| **Instance family** | `t` burstable, `m` general, `c` compute, `r` memory, `g`/`p` GPU | Start with `m6i` or `m7g` (Graviton, cheaper) |
| **Size** | `large`, `xlarge`, ... | Measure CPU and memory before choosing |
| **AMI** | Amazon Linux 2023, Ubuntu, Windows, custom | Bake custom AMIs with Packer for golden images |
| **Purchase** | On-demand, Savings Plans, Spot | Spot for fault-tolerant batch; Savings Plans for baseline |
| **Storage** | EBS (block, per instance), instance store (ephemeral) | EBS `gp3` is the default |

### Launch an instance

```bash
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type m7g.large \
  --subnet-id subnet-0ddd3333eee44444f \
  --security-group-ids sg-0app00000000000b \
  --iam-instance-profile Name=orders-ec2-profile \
  --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
  --user-data file://bootstrap.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=orders-app}]'
```

```output
{
    "Instances": [
        {
            "InstanceId": "i-0123456789abcdef0",
            "InstanceType": "m7g.large",
            "State": { "Name": "pending" }
        }
    ]
}
```

`HttpTokens=required` enforces **IMDSv2**. It stops a server-side request forgery bug from reading instance credentials through the metadata endpoint, which is how several well-known breaches happened.

### Instance metadata and roles

Never put access keys on an instance. Attach an **instance profile** (a wrapper around an IAM role). The SDK fetches temporary credentials automatically.

```bash
# On the instance, IMDSv2 requires a token first
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

### EC2 pricing models

| Model | Discount | Commitment | Interruption | Best for |
|---|---|---|---|---|
| **On-Demand** | None | None; per second (Linux) | None | Unpredictable workloads, short tests, first deployments |
| **Savings Plans** | Up to about 72% | 1 or 3 years, $ per hour | None | Steady baseline across EC2, Fargate and Lambda; flexible across families and regions (Compute Savings Plans) |
| **Reserved Instances** | Up to about 72% | 1 or 3 years, specific instance type and region | None | Steady, predictable workloads on a known instance type (Savings Plans now cover most of these cases) |
| **Spot** | Up to about 90% | None | Can be reclaimed with a 2-minute notice | Batch, CI runners, stateless workers, big data, fault-tolerant jobs |
| **Dedicated Hosts** | Varies | Optional | None | Bring-your-own-licence and compliance needs for physical hosts |
| **Capacity Reservations** | None (reserves capacity) | Optional | None | Guarantee capacity in an AZ for a launch |

Discounts are indicative; check current pricing for your region and instance type.

A typical blend: Savings Plans for the always-on baseline, On-Demand for variable peaks, and Spot for interruptible batch work.

```bash
# Check Spot prices for a family before launching
aws ec2 describe-spot-price-history --instance-types m7g.large m6i.large \
  --product-descriptions "Linux/UNIX" --max-items 4 \
  --query "SpotPriceHistory[].[InstanceType,AvailabilityZone,SpotPrice]" --output table
```

Handle Spot interruptions by checking the instance metadata for the notice, then draining work:

```bash
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/spot/instance-action   # 404 until an interruption is scheduled
```

## Amazon Machine Images (AMIs)

An AMI is the template an instance starts from: the root volume (OS and software), launch permissions, and block device mappings. You choose one at launch.

| Source | Use for |
|---|---|
| AWS-provided (Amazon Linux 2023, Ubuntu, Windows) | Standard starting points, kept current by AWS or the vendor |
| Marketplace | Commercial software pre-installed, billed per hour or per year |
| Custom (your own) | Golden images with your agents, hardening and runtime preinstalled |

```bash
aws ec2 describe-images --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023*" "Name=architecture,Values=arm64" \
  --query "sort_by(Images,&CreationDate)[-1].[ImageId,Name]" --output text

aws ec2 create-image --instance-id i-0123456789abcdef0 --name "orders-golden-2026-10" --no-reboot
```

Use **EC2 Image Builder** to build and patch golden AMIs on a schedule, rather than hand-baking them.

Instance types are named by family, generation, and size: `m7g.large` is general purpose (`m`), 7th generation (`7`), Graviton ARM processor (`g`), size `large`. Suffixes matter too: `d` adds local NVMe storage, `n` adds network bandwidth, `a` is AMD.

## AWS Elastic Beanstalk

Elastic Beanstalk is a PaaS for web applications. You upload code or a container image, choose a platform (Java, Python, Node.js, .NET, Docker), and Beanstalk provisions the load balancer, Auto Scaling group, EC2 instances, monitoring, and deployment. You keep full access to the underlying resources.

| Benefit | Trade-off |
|---|---|
| Fast setup for standard web apps | Less control than building the stack yourself |
| Managed deployments (all at once, rolling, immutable, blue/green) | Environments are tied to Beanstalk's conventions |
| Environment config, health monitoring, logs | Some services need extra work to integrate |

```bash
# Using the EB CLI
eb init orders-service --platform corretto-21 --region us-east-1
eb create orders-prod --instance_type t3.medium --elb-type application \
  --min-instances 2 --max-instances 6 --envvars SPRING_PROFILES_ACTIVE=prod
eb deploy orders-prod
eb health orders-prod
```

```output
  Environment health has transitioned to Ok.
  Environment details for: orders-prod
  Health: Green
```

Beanstalk can also run a Docker image from ECR through a `Dockerrun.aws.json` file. For new container workloads, ECS on Fargate gives more control and is the usual next step after Beanstalk.

| Deployment policy | Behaviour |
|---|---|
| All at once | Fastest; brief downtime |
| Rolling | Replaces batches; reduced capacity during the deploy |
| Rolling with additional batch | Keeps full capacity by adding a batch first |
| Immutable | Launches a new Auto Scaling group; swaps when healthy |
| Blue/green | Separate environment; swap CNAMEs |

## Auto Scaling groups

An **Auto Scaling group (ASG)** keeps a set of identical instances running across subnets and AZs, replaces unhealthy ones, and scales with policies. It uses a **launch template** to define each instance.

```bash
aws ec2 create-launch-template --launch-template-name orders-lt \
  --launch-template-data '{
    "ImageId": "ami-0abcdef1234567890",
    "InstanceType": "m7g.large",
    "IamInstanceProfile": {"Name": "orders-ec2-profile"},
    "SecurityGroupIds": ["sg-0app00000000000b"],
    "MetadataOptions": {"HttpTokens": "required"}
  }'

aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name orders-asg \
  --launch-template LaunchTemplateName=orders-lt,Version='$Latest' \
  --min-size 2 --max-size 10 --desired-capacity 2 \
  --vpc-zone-identifier "subnet-0ddd3333eee44444f,subnet-0eee4444fff55555a" \
  --target-group-arns arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/orders/abc123 \
  --health-check-type ELB --health-check-grace-period 120
```

Scaling policy types:

| Type | Behaviour |
|---|---|
| **Target tracking** | Keep a metric at a value, e.g. average CPU at 50% (recommended) |
| **Step scaling** | Add or remove capacity in steps as an alarm grows |
| **Scheduled** | Scale at known times, such as before a sales event |

## Load balancers

| Type | Layer | Use for |
|---|---|---|
| **Application Load Balancer (ALB)** | 7 (HTTP, HTTPS, gRPC) | Web APIs; path and host routing; ECS and EKS targets |
| **Network Load Balancer (NLB)** | 4 (TCP, UDP, TLS) | Very high throughput, static IPs, non-HTTP protocols |
| **Gateway Load Balancer (GWLB)** | 3 | Inline security appliances (firewalls) |

## Lambda

Lambda runs your function on demand. You upload code, set memory and timeout, and AWS handles servers, scaling and patching. You pay per request and per GB-second.

### Limits to know

| Setting | Value |
|---|---|
| Max timeout | 15 minutes |
| Memory | 128 MB to 10,240 MB (CPU scales with memory) |
| Package size | 50 MB zipped direct upload; 10 GB container image |
| Concurrency | Default account limit 1,000 per region (adjustable) |
| Ephemeral `/tmp` | 512 MB to 10 GB |

### A working handler

```python
# lambda_function.py
import json
import os
import boto3

table = boto3.resource("dynamodb").Table(os.environ["ORDERS_TABLE"])

def lambda_handler(event, context):
    # Works behind API Gateway (HTTP API payload format 2.0)
    order_id = event["pathParameters"]["orderId"]

    item = table.get_item(Key={"orderId": order_id}).get("Item")
    if item is None:
        return {"statusCode": 404, "body": json.dumps({"error": "not found"})}

    return {"statusCode": 200, "body": json.dumps(item, default=str)}
```

Create and invoke from the CLI:

```bash
zip function.zip lambda_function.py
aws lambda create-function \
  --function-name get-order \
  --runtime python3.12 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::123456789012:role/get-order-lambda-role \
  --environment "Variables={ORDERS_TABLE=orders}" \
  --memory-size 512 --timeout 10

aws lambda invoke --function-name get-order \
  --payload '{"pathParameters":{"orderId":"o-1001"}}' \
  --cli-binary-format raw-in-base64-out response.json
cat response.json
```

```output
{"statusCode": 200, "body": "{\"orderId\": \"o-1001\", \"total\": 129.5, \"status\": \"SHIPPED\"}"}
```

### Triggers

Lambda is event-driven. Common triggers: API Gateway or ALB (HTTP), S3 object created, SQS queue, SNS topic, EventBridge rule, DynamoDB Streams, Kinesis, and scheduled rules (cron).

### Cold starts

The first invocation on a new execution environment initialises the runtime and your code, which adds latency. Mitigations:

- Keep dependencies small and initialise SDK clients outside the handler (as above).
- Raise memory, which also raises CPU.
- Use **Provisioned Concurrency** for latency-sensitive endpoints.
- Use SnapStart (Java and Python in supported runtimes) to restore from a snapshot.

### Lambda or containers?

| Lambda is a good fit | Containers (ECS/EKS) are a better fit |
|---|---|
| Spiky or infrequent traffic | Steady, always-on load |
| Event-driven glue and file processing | Long-running connections (WebSockets, streaming) |
| Small, short tasks under 15 minutes | Tasks over 15 minutes or large native dependencies |
| Teams that want zero server management | Teams that already run Kubernetes or ECS |

## Key takeaways

- EC2 gives full control; ASGs keep a fleet healthy and scaled.
- Enforce IMDSv2 and use instance profiles, never access keys on hosts.
- Lambda: 15-minute limit, per-request billing, watch cold starts, create SDK clients outside the handler.
- Choose the compute level by how much operational work the team wants to own.
