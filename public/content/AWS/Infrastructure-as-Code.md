# AWS: Infrastructure as Code (CloudFormation, CDK, Terraform)

Clicking through the console does not scale and cannot be reviewed or reproduced. **Infrastructure as Code (IaC)** describes resources in files that live in git, get reviewed like code, and are deployed the same way each time.

| Tool | Language | Owned by | Notes |
|---|---|---|---|
| **CloudFormation** | YAML or JSON templates | AWS | Native; stacks, change sets, drift detection; no state file to manage |
| **AWS CDK** | TypeScript, Python, Java, C# | AWS | Writes code that synthesises to CloudFormation |
| **Terraform / OpenTofu** | HCL | HashiCorp / community | Multi-cloud; provider ecosystem; state file you must store safely |
| **SAM** | CloudFormation extension | AWS | Shorthand for serverless (Lambda, API Gateway) |

## CloudFormation

A template declares resources; CloudFormation creates them in dependency order and can roll back on failure.

```yaml
# orders-stack.yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Orders bucket and queue

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, prod]

Resources:
  ExportsBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain          # keep the bucket if the stack is deleted
    Properties:
      BucketName: !Sub orders-exports-${Environment}-${AWS::AccountId}
      VersioningConfiguration:
        Status: Enabled
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: aws:kms
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  OrdersQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub orders-${Environment}
      VisibilityTimeout: 60
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt OrdersDLQ.Arn
        maxReceiveCount: 5

  OrdersDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub orders-${Environment}-dlq

Outputs:
  BucketName:
    Value: !Ref ExportsBucket
  QueueUrl:
    Value: !Ref OrdersQueue
```

```bash
# Preview changes first, then deploy
aws cloudformation deploy \
  --template-file orders-stack.yaml \
  --stack-name orders-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset

aws cloudformation describe-stacks --stack-name orders-dev \
  --query "Stacks[0].Outputs" --output table
```

```output
Waiting for changeset to be created..
Waiting for stack create/update to complete
Successfully created/updated stack - orders-dev
-----------------------------------------------------------------------
|                           DescribeStacks                            |
+-------------+-----------------------------------------------------------+
|  BucketName |  orders-exports-dev-123456789012                          |
|  QueueUrl   |  https://sqs.us-east-1.amazonaws.com/123456789012/orders-dev |
+-------------+-----------------------------------------------------------+
```

### Key CloudFormation concepts

| Concept | Purpose |
|---|---|
| **Parameters** | Inputs per deployment |
| **Resources** | What to create |
| **Outputs** | Values for other stacks (use `Export`/`ImportValue` to share) |
| **Intrinsic functions** | `!Ref`, `!Sub`, `!GetAtt`, `!Join`, `!If` |
| **Change sets** | Preview of what will be created, changed, or replaced |
| **Drift detection** | Finds resources changed outside CloudFormation |
| **Stack policies** | Protect critical resources from updates |
| **DeletionPolicy** | `Retain`, `Snapshot` or `Delete` on removal |

## AWS CDK

CDK lets you write infrastructure in a programming language with loops, types and functions. `cdk synth` produces the CloudFormation template.

```python
# app.py (CDK v2, Python)
import aws_cdk as cdk
from aws_cdk import aws_s3 as s3, aws_sqs as sqs, RemovalPolicy, Duration
from constructs import Construct

class OrdersStack(cdk.Stack):
    def __init__(self, scope: Construct, id: str, env_name: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        dlq = sqs.Queue(self, "OrdersDlq", queue_name=f"orders-{env_name}-dlq")
        queue = sqs.Queue(
            self, "OrdersQueue",
            queue_name=f"orders-{env_name}",
            visibility_timeout=Duration.seconds(60),
            dead_letter_queue=sqs.DeadLetterQueue(max_receive_count=5, queue=dlq),
        )

        s3.Bucket(
            self, "ExportsBucket",
            versioned=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.KMS_MANAGED,
            removal_policy=RemovalPolicy.RETAIN,
        )

app = cdk.App()
OrdersStack(app, "OrdersDev", env_name="dev")
app.synth()
```

```bash
cdk bootstrap                # one-time per account and region
cdk diff OrdersDev           # compare with what is deployed
cdk deploy OrdersDev
```

## Terraform

Terraform keeps a **state file** that maps your code to real resources. Store it remotely with locking, for example in S3 with DynamoDB locking.

```hcl
terraform {
  required_version = ">= 1.6"

  backend "s3" {
    bucket         = "acme-terraform-state"
    key            = "orders/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Service = "orders", Environment = "prod", ManagedBy = "terraform" }
  }
}

variable "environment" {
  type    = string
  default = "prod"
}

resource "aws_sqs_queue" "orders_dlq" {
  name = "orders-${var.environment}-dlq"
}

resource "aws_sqs_queue" "orders" {
  name                       = "orders-${var.environment}"
  visibility_timeout_seconds = 60
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 5
  })
}

output "queue_url" {
  value = aws_sqs_queue.orders.url
}
```

```bash
terraform init
terraform plan -out=tfplan      # review every change
terraform apply tfplan
terraform output queue_url
```

```output
Plan: 2 to add, 0 to change, 0 to destroy.
...
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.

Outputs:
queue_url = "https://sqs.us-east-1.amazonaws.com/123456789012/orders-prod"
```

Always read the plan before applying. A `-/+` line means the resource will be destroyed and recreated, which for a database can mean data loss.

## Choosing a tool

| Situation | Choose |
|---|---|
| AWS-only, want no extra state to manage | CloudFormation |
| AWS-only, developers want real code and tests | CDK |
| Multiple clouds or SaaS providers in one workflow | Terraform / OpenTofu |
| Mostly serverless functions and APIs | SAM or CDK |
| Team already has Terraform modules | Terraform |

## Pipelines

A typical pipeline runs `plan` on every pull request, posts the output for review, and runs `apply` only on merge to the main branch, using a role that only the pipeline can assume. Services: CodePipeline and CodeBuild, GitHub Actions with OIDC (no long-lived keys), or GitLab CI.

## Key takeaways

- IaC makes infrastructure reviewable, repeatable and reversible.
- CloudFormation is native with no state to manage; CDK adds real programming; Terraform works across clouds but needs remote state with locking.
- Always preview changes (change sets, `cdk diff`, `terraform plan`) and watch for replacements.
- Use `DeletionPolicy: Retain` or `prevent_destroy` on stateful resources.
- Deploy from a pipeline with a dedicated role, not from a laptop.
