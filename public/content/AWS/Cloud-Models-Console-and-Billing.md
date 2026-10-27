# AWS: Cloud Models, Console and Billing

This page covers the foundations you need before touching any service: the three cloud service models, the pay-as-you-go model, how to move around the AWS Management Console, how to choose a region, and how to set billing alerts so the first surprise is an email rather than an invoice.

## Cloud service models: IaaS, PaaS, SaaS

Each model moves responsibility from you to the provider. The higher the level, the less you operate and the less you control.

| Model | What AWS provides | What you manage | AWS examples |
|---|---|---|---|
| **IaaS** (Infrastructure as a Service) | Virtual machines, networks, storage | OS, runtime, middleware, application, data | EC2, VPC, EBS |
| **PaaS** (Platform as a Service) | Runtime and platform, deployment handled | Application code and data | Elastic Beanstalk, Lambda, RDS, App Runner |
| **SaaS** (Software as a Service) | Complete application | Users and data only | Amazon WorkMail, Amazon Connect, QuickSight |

A simple way to remember it:

```
              You manage                          AWS manages
IaaS   [ app | data | runtime | OS ]          [ virtualisation | servers | storage | network ]
PaaS   [ app | data ]                        [ runtime | OS | scaling | patching ... ]
SaaS   [ users | data ]                      [ everything else ]
```

Serverless (Lambda, Fargate, DynamoDB) sits at the PaaS end: you do not see or patch servers, but you still write the application and design the data.

## Pay-as-you-go

AWS charges for what you use, usually by the second, hour, request, GB or GB-month. There is no upfront hardware purchase.

| Benefit | Consequence |
|---|---|
| No capacity to buy in advance | You can scale up and down as demand changes |
| Costs follow usage | Forgotten resources keep costing money |
| Many services have a free tier | Check the free tier limits for your account before assuming free |

Commitment-based discounts reduce the rate for steady usage (see the Compute page for Savings Plans and Reserved Instances). Usage-based pricing is still the default.

### What drives most bills

| Cost driver | Typical cause |
|---|---|
| EC2 instances left running | Dev and test instances never stopped |
| NAT Gateway | Data processed through NAT for S3 or ECR traffic |
| Data transfer out | Serving large files or APIs to the internet |
| Load balancers | Idle ALBs and NLBs |
| Storage without lifecycle rules | Old snapshots, unattached EBS volumes, S3 versions |
| CloudWatch Logs | Verbose logs with no retention period |

## AWS Management Console

The console is the browser interface to all services. Learn its layout once and most services follow the same pattern.

| Area | Use it for |
|---|---|
| **Search bar** (top) | Jump to any service by name (type `ec2`, `s3`, `ecs`) |
| **Region selector** (top right) | Choose where resources are created. Resources are regional, so a resource in `us-east-1` is not visible in `eu-west-2`. |
| **Account menu** (top right) | Billing and Cost Management, Security credentials, switch role |
| **Services menu** | Grouped list of all services |
| **Favourites** | Pin services you use often |
| **CloudShell** (icon in the top bar) | A browser terminal with the AWS CLI already configured |

### Choosing a region

Pick the region by these criteria, in order:

1. **Data residency and compliance**: where the law requires data to stay
2. **Latency**: close to your users
3. **Service availability**: not every service launches in every region first
4. **Price**: prices differ by region; check the pricing pages before you commit

Make the region explicit in scripts and tools. The CLI uses the configured default, which is a common cause of "where did my resources go?"

```bash
aws configure get region
aws ec2 describe-regions --query "Regions[].RegionName" --output table
aws ec2 describe-instances --region eu-west-2 --query "Reservations[].Instances[].InstanceId"
```

```output
us-east-1
...
```

## Billing alerts with AWS Budgets

Set a budget before you create resources. Budgets notify you when actual or forecasted spend crosses a threshold.

Create a monthly cost budget of 50 USD, with an email at 80% of actual spend and another at 100% of forecasted spend:

```json
// budget.json
{
  "BudgetName": "monthly-cost-limit",
  "BudgetLimit": { "Amount": "50", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
```

```json
// notifications.json
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [ { "SubscriptionType": "EMAIL", "Address": "you@example.com" } ]
  },
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [ { "SubscriptionType": "EMAIL", "Address": "you@example.com" } ]
  }
]
```

```bash
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
aws budgets describe-budgets --account-id 123456789012 --query "Budgets[].BudgetName"
```

```output
[
    "monthly-cost-limit"
]
```

Other billing controls:

| Tool | Purpose |
|---|---|
| **Cost Explorer** | Graph spend by service, region, tag; forecast next month |
| **Cost Anomaly Detection** | Machine-learned alerts when spend changes unexpectedly |
| **Cost allocation tags** | Group costs by team or environment; activate tags in Billing preferences |
| **Free Tier usage alerts** | Warn before you exceed free tier limits |
| **CloudWatch billing alarm** | Alarm on the `EstimatedCharges` metric (published in `us-east-1` only; enable "Receive Billing Alerts" first) |

## Common mistakes in a first account

- Working in the wrong region and assuming resources are missing
- Creating a NAT Gateway for a learning exercise and forgetting it (it bills by the hour even when idle)
- Leaving an Elastic IP unattached, which is charged
- Using the root user for daily work instead of an IAM Identity Center user

## Key takeaways

- IaaS gives you machines, PaaS gives you a platform, SaaS gives you a finished application; each step moves operational work to AWS.
- Pay-as-you-go means costs follow usage, so set budgets and tag resources from day one.
- Resources are regional. Choose the region deliberately and make it explicit in code.
- Set a Budget with email alerts before creating anything expensive.
