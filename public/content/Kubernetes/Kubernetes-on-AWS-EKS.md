# Kubernetes on AWS: EKS

**Amazon EKS** (Elastic Kubernetes Service) runs the Kubernetes control plane for you. AWS operates the API server and etcd across three availability zones. You manage the worker capacity and your workloads.

| You manage | AWS manages |
|---|---|
| Worker nodes (or Fargate profiles) | Control plane: API server, etcd, scheduler, controllers |
| Applications, Helm charts, add-ons | Control plane upgrades (you trigger them) |
| IAM roles and network setup | Control plane high availability and backups |

## Choosing compute for EKS

| Option | What it is | Use when |
|---|---|---|
| **Managed node groups** | EC2 instances that AWS patches and replaces | Default choice; full control of instance types |
| **Self-managed nodes** | EC2 instances you run | Custom AMIs or unusual requirements |
| **Fargate** | Serverless pods; no nodes to manage | Spiky or small workloads; no DaemonSets |
| **Karpenter** | Launches right-sized EC2 on demand | Large, cost-sensitive clusters |

## Create a cluster with eksctl

`eksctl` is the quickest way to create a cluster for learning or a dev environment. Production teams usually use Terraform or CloudFormation so the setup is reviewable.

```yaml
# cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: demo
  region: us-east-1
  version: "1.30"
managedNodeGroups:
  - name: general
    instanceType: m6i.large
    minSize: 2
    maxSize: 5
    desiredCapacity: 3
    privateNetworking: true
```

```bash
eksctl create cluster -f cluster.yaml
aws eks update-kubeconfig --region us-east-1 --name demo
kubectl get nodes
```

```output
NAME                             STATUS   ROLES    AGE   VERSION
ip-10-0-11-42.ec2.internal       Ready    <none>   4m    v1.30.x-eks-xxxx
ip-10-0-12-87.ec2.internal       Ready    <none>   4m    v1.30.x-eks-xxxx
ip-10-0-13-19.ec2.internal       Ready    <none>   4m    v1.30.x-eks-xxxx
```

Remember to delete the cluster when done: `eksctl delete cluster -f cluster.yaml`.

## Networking: VPC CNI

Each pod gets an IP address from the VPC subnet, through the **AWS VPC CNI** plugin. Pods are therefore directly routable inside the VPC, and security groups can be attached to pods.

- Subnets need enough free IPs. A `/24` subnet runs out quickly; use `/19` or larger for node and pod subnets, or enable prefix delegation.
- Put nodes and pods in private subnets. Public subnets are only for load balancers.

## IAM: giving pods AWS permissions

Never put AWS access keys in a pod. Give the pod an IAM role instead. Two mechanisms exist:

| Mechanism | How it works |
|---|---|
| **IRSA** (IAM Roles for Service Accounts) | ServiceAccount annotated with a role ARN; OIDC identity provider trusts the cluster |
| **EKS Pod Identity** | Newer and simpler; an association links a ServiceAccount to a role without OIDC setup |

IRSA example:

```bash
eksctl create iamserviceaccount \
  --cluster demo \
  --namespace team-orders \
  --name orders \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve
```

The pod then uses that ServiceAccount:

```yaml
spec:
  serviceAccountName: orders     # the AWS SDK picks up the role automatically
  containers:
    - name: orders
      image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service:1.0
```

## Pulling images from ECR

Nodes need `AmazonEC2ContainerRegistryReadOnly` (managed node groups add it by default). Images are then pulled with a URL like this:

```
123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service:1.0
```

See the ECR page in the AWS section.

## Load balancers: AWS Load Balancer Controller

Install the **AWS Load Balancer Controller** to turn Ingress objects into an Application Load Balancer, and LoadBalancer Services into a Network Load Balancer.

```yaml
# Ingress handled by the AWS Load Balancer Controller
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip        # route straight to pod IPs
    alb.ingress.kubernetes.io/healthcheck-path: /actuator/health/readiness
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789012:certificate/abcd-1234
spec:
  ingressClassName: alb
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: orders
                port:
                  number: 80
```

```bash
kubectl get ingress shop
```

```output
NAME   CLASS   HOSTS              ADDRESS                                                      PORTS     AGE
shop   alb     shop.example.com   k8s-team-shop-abc123-111222333.us-east-1.elb.amazonaws.com   80,443    2m
```

## Storage on EKS

| Need | Driver | Storage class example |
|---|---|---|
| Block storage, one pod (RWO) | EBS CSI driver | `gp3` |
| Shared file system (RWX) | EFS CSI driver | `efs-sc` |

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
```

## Upgrades

EKS supports a fixed set of Kubernetes versions, and each one reaches end of support after a while. Plan an upgrade roughly every quarter:

1. Upgrade the control plane (`eksctl upgrade cluster` or the console/API).
2. Upgrade add-ons (VPC CNI, CoreDNS, kube-proxy) to versions compatible with the new control plane.
3. Upgrade node groups. Managed node groups roll nodes with PodDisruptionBudgets respected.
4. Check deprecated API versions with a tool such as `pluto` before upgrading.

```bash
aws eks describe-cluster --name demo --query cluster.version
aws eks list-addons --cluster-name demo
```

## Observability

- **Control plane logs**: enable API, audit, and authenticator logs to CloudWatch Logs.
- **Container Insights** or the **AWS Distro for OpenTelemetry** for metrics and traces.
- **Prometheus and Grafana** if you want the open-source stack; see the Observability page in the Java section.

## Key takeaways

- EKS runs the control plane; you own node capacity, add-ons and workloads.
- Pods get VPC IP addresses, so plan subnet sizes early.
- Give pods AWS access with IRSA or EKS Pod Identity, never with access keys.
- Use the AWS Load Balancer Controller for Ingress and LoadBalancer Services.
- Upgrade in order: control plane, add-ons, then nodes.
