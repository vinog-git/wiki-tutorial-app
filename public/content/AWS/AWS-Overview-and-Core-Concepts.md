# AWS: Overview and Core Concepts

Amazon Web Services (AWS) is a collection of over 200 cloud services. You rent compute, storage, databases and networking by the second or by the request instead of buying servers. Almost every cloud interview starts with these foundations.

## Global infrastructure

| Term | Meaning | Example |
|---|---|---|
| **Region** | A geographic area with several data centres | `us-east-1` (N. Virginia), `eu-west-2` (London) |
| **Availability Zone (AZ)** | One or more isolated data centres inside a region | `us-east-1a`, `us-east-1b` |
| **Edge location** | Cache points for CloudFront and Route 53 | Hundreds worldwide |

Design for failure by spreading resources across **at least two AZs**. A single AZ outage then does not take the app down. Most regional services (S3, DynamoDB, Lambda) already span AZs for you.

## Shared responsibility model

| AWS is responsible for (security *of* the cloud) | You are responsible for (security *in* the cloud) |
|---|---|
| Physical data centres, hardware, network backbone | Your data and its encryption choices |
| Hypervisor and managed service software | IAM users, roles and policies |
| Availability of regional managed services | OS patching on EC2; container images |
| Compliance certifications of the platform | Network configuration (security groups, NACLs) |

The split moves with the service type. With EC2 you own the OS. With Lambda you only own your code and its permissions.

## Accounts and governance

- **Account**: a security and billing boundary. Use one per environment (dev, staging, prod) and per team where practical.
- **AWS Organizations**: groups accounts under a root, applies **service control policies (SCPs)** that limit what any account can do, and consolidates billing.
- **AWS Control Tower**: sets up a landing zone with guardrails across accounts.
- **IAM Identity Center** (formerly SSO): single sign-on for people across accounts.

## Pricing basics

| Model | Example | Notes |
|---|---|---|
| Pay as you go | EC2 per second, Lambda per request and per GB-second | Default |
| Reserved / Savings Plans | Commit to 1 or 3 years for a discount | Good for steady baseline load |
| Spot | Spare EC2 capacity at up to 90% off | Can be interrupted with a 2-minute notice |
| Free tier | Limited monthly usage for 12 months and some always-free services | Check usage before assuming free |

Turn on **AWS Budgets** and **Cost Explorer** early. Cost surprises are usually NAT Gateway data transfer, forgotten load balancers and oversized databases.

## Well-Architected Framework

AWS reviews architectures against six pillars. Interviewers often ask you to name them:

1. **Operational excellence**: run and monitor systems, improve processes
2. **Security**: protect data and systems, least privilege, encryption
3. **Reliability**: recover from failure, multi-AZ, backups, scaling
4. **Performance efficiency**: use compute and storage efficiently
5. **Cost optimization**: avoid waste, right-size, use the right pricing model
6. **Sustainability**: minimise environmental impact of workloads

## Access the platform

Three ways in: the web console, the **AWS CLI**, and SDKs (boto3 for Python, AWS SDK for Java). Use the CLI in scripts and CI.

```bash
# Install and configure (use SSO in real teams; access keys only for learning)
aws configure sso
aws sts get-caller-identity
```

```output
{
    "UserId": "AROAEXAMPLE:orders-dev",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/Developer/orders-dev"
}
```

`sts get-caller-identity` is the first command to run when something is "not working". It shows which identity the CLI is using.

```bash
aws ec2 describe-regions --query "Regions[].RegionName" --output table
```

## Key takeaways

- Regions contain AZs; spread workloads across at least two AZs.
- AWS secures the cloud; you secure what you put in it.
- Use Organizations and SCPs to separate accounts and set guardrails.
- Pick the pricing model to match the workload: on-demand, savings plans, or spot.
- Check identity with `aws sts get-caller-identity` before debugging anything else.
