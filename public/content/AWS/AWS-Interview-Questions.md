# AWS Interview Questions

Short answers first, with the page that covers the depth. Scenario questions at the end are where interviewers separate candidates.

## Foundations

**1. What is a Region and an Availability Zone?**
A Region is a geographic area (for example `us-east-1`) with several isolated data centres. An AZ is one or more of those data centres within a region, with independent power and networking. Spread workloads across at least two AZs. *(See Overview.)*

**2. Explain the shared responsibility model.**
AWS secures the infrastructure: hardware, facilities, managed service software. The customer secures what they build: data, IAM, OS on EC2, network configuration, and application code. The split depends on the service type. *(See Overview.)*

**3. Name the Well-Architected pillars.**
Operational excellence, security, reliability, performance efficiency, cost optimization, sustainability. *(See Overview.)*

**4. What is the difference between Organizations and Control Tower?**
Organizations groups accounts and applies service control policies. Control Tower builds on it to set up a secure multi-account landing zone with guardrails. *(See Overview and [IAM](/AWS/IAM).)*

## IAM and security

**5. Users, groups, roles and policies?**
Users are long-lived identities for people. Groups hold policies for many users. Roles are assumed for temporary credentials, used by services and cross-account access. Policies are JSON documents of allow and deny statements. *(See [IAM](/AWS/IAM).)*

**6. Explain the policy evaluation logic.**
An explicit Deny always wins. Otherwise access requires an explicit Allow from an identity policy, resource policy, or permissions boundary. If there is no Allow, the request is denied by default. *(See [IAM](/AWS/IAM).)*

**7. What is the difference between a role's trust policy and its permissions policy?**
The trust policy says who can assume the role (the Principal). The permissions policy says what the role can do once assumed. *(See [IAM](/AWS/IAM).)*

**8. Why use roles instead of access keys?**
Roles give temporary credentials that rotate automatically and are not stored in code. Access keys are long-lived and leak easily. *(See [IAM](/AWS/IAM).)*

**9. What is an SCP?**
A service control policy that sets the maximum permissions for accounts in an organization. It does not grant permissions; it limits them, and applies even to account administrators. *(See [IAM](/AWS/IAM).)*

**10. What is IMDSv2 and why does it matter?**
A session-oriented version of the EC2 instance metadata service. It requires a token obtained by a PUT request, which blocks many server-side request forgery attacks that could steal instance role credentials. *(See Compute.)*

**11. How do you store a database password for an application?**
In Secrets Manager with automatic rotation, referenced at runtime by the app or by the ECS task definition's `secrets` field. Never in code, environment files or images. *(See Monitoring and Security.)*

## Networking

**12. What makes a subnet public or private?**
Whether its route table has a route to an Internet Gateway (public) or not (private). A subnet with an auto-assigned public IP is not the same thing; the route is what makes it reachable. *(See VPC.)*

**13. Security groups vs NACLs?**
Security groups are stateful, attach to resources, and allow rules only. NACLs are stateless, attach to subnets, and support allow and deny rules evaluated in order. *(See VPC.)*

**14. What does a NAT Gateway do, and why might it be expensive?**
It lets resources in private subnets reach the internet, while blocking unsolicited inbound traffic. It charges per hour and per GB processed. Use VPC endpoints for AWS services to reduce the traffic. *(See VPC.)*

**15. What is a VPC endpoint?**
A private connection from your VPC to an AWS service (or PrivateLink service) without traversing the internet. Gateway endpoints exist for S3 and DynamoDB; interface endpoints for most others. *(See VPC.)*

**16. VPC peering vs Transit Gateway?**
Peering connects two VPCs directly and is not transitive. Transit Gateway is a hub that connects many VPCs and on-premises networks, and routes between them. *(See VPC.)*

## Storage

**17. What is S3 and what is its durability?**
An object storage service with objects in buckets, accessed by key. Designed for 99.999999999% (11 nines) durability and 99.99% availability for Standard. *(See [S3](/AWS/S3).)*

**18. Name the S3 storage classes.**
Standard, Intelligent-Tiering, Standard-IA, One Zone-IA, Glacier Instant Retrieval, Glacier Flexible Retrieval, Glacier Deep Archive. *(See [S3](/AWS/S3).)*

**19. How do you make an S3 bucket secure by default?**
Block Public Access on, default encryption (SSE-KMS for audit), versioning for important data, bucket policies that deny insecure transport, and Object Ownership set to bucket owner enforced. *(See [S3](/AWS/S3).)*

**20. How do you share a private object for a short time?**
A presigned URL with a short expiry, generated by a principal that has access. *(See [S3](/AWS/S3).)*

**21. What is the difference between `s3:ListBucket` and `s3:GetObject` in a policy?**
`ListBucket` applies to the bucket ARN (`arn:aws:s3:::bucket`). `GetObject` applies to object ARNs (`arn:aws:s3:::bucket/*`). A policy written against the wrong ARN silently does nothing. *(See [S3](/AWS/S3) and [IAM](/AWS/IAM).)*

**22. What are S3 event notifications?**
Messages sent when objects are created or deleted, delivered to SQS, SNS, EventBridge or Lambda. Commonly used for file processing pipelines. *(See [S3](/AWS/S3) and Messaging.)*

## Containers

**23. ECS vs EKS?**
ECS is AWS's own orchestrator with a simpler model and deep AWS integration. EKS is managed Kubernetes, which gives the Kubernetes API, its ecosystem, and portability. Choose ECS for simplicity, EKS for Kubernetes skills or tooling. *(See [ECS](/AWS/ECS) and EKS.)*

**24. Fargate vs EC2 launch type?**
Fargate runs tasks without servers to manage and bills per task resources. EC2 gives host control, GPUs and Spot pricing, with instances to operate. *(See [ECS](/AWS/ECS).)*

**25. What is the difference between an ECS task role and task execution role?**
The task execution role is used by the ECS agent to pull images from ECR, send logs, and fetch secrets. The task role is used by the application's own AWS SDK calls. *(See [ECS](/AWS/ECS).)*

**26. How does an ECS service do a zero-downtime deployment?**
By setting `minimumHealthyPercent` to 100 and `maximumPercent` to 200, so new tasks start and pass health checks before old tasks stop. A deployment circuit breaker rolls back a failing deployment automatically. For traffic-shifting, use CodeDeploy blue/green. *(See [ECS](/AWS/ECS).)*

**27. What is ECR and why use immutable tags?**
ECR is AWS's private container image registry, integrated with IAM and vulnerability scanning. Immutable tags stop a published version tag from being overwritten, so `orders:1.4.2` always means the same image. *(See [ECR](/AWS/ECR).)*

**28. How do you clean up old images in ECR?**
With a lifecycle policy that expires untagged images after a set number of days and keeps only the most recent N tagged images. *(See [ECR](/AWS/ECR).)*

## Compute and serverless

**29. EC2 vs Lambda vs Fargate: when do you pick which?**
EC2 for full control and long-running workloads. Fargate for containers without servers. Lambda for event-driven, short tasks with spiky load and no server management. *(See Compute.)*

**30. Lambda limits and cold starts?**
Maximum 15-minute timeout, up to 10 GB memory, concurrency limits per region. A cold start initialises a new execution environment. Mitigate with small packages, SDK clients created outside the handler, Provisioned Concurrency, or SnapStart. *(See Compute.)*

**31. What is an Auto Scaling group?**
A group of identical EC2 instances from a launch template, spread across subnets, with health checks and scaling policies. *(See Compute.)*

## Databases

**32. RDS Multi-AZ vs read replicas?**
Multi-AZ is a synchronous standby for automatic failover; it does not serve reads. Read replicas are asynchronous copies for read scaling and can be in other regions. *(See Databases.)*

**33. When would you choose DynamoDB over RDS?**
When access patterns are known, you need single-digit millisecond latency at very high scale, and you want no servers to manage. RDS when you need relational joins, transactions across many tables, or an existing SQL app. *(See Databases.)*

**34. How do you design a DynamoDB table?**
Start from the access patterns. Pick a partition key with high cardinality to avoid hot partitions, a sort key for range queries, and GSIs for other patterns. Use Query, not Scan. *(See Databases.)*

**35. What is a hot partition?**
One partition key receiving a disproportionate share of traffic, which throttles even when the table has spare capacity overall. Fix by choosing a better key or adding a write-sharding suffix. *(See Databases.)*

## Messaging

**36. SQS vs SNS vs EventBridge?**
SQS is a queue for work distribution. SNS is pub/sub fan-out to many subscribers. EventBridge routes events by content with rules and supports schedules and SaaS sources. *(See Messaging.)*

**37. SQS Standard vs FIFO?**
Standard gives near-unlimited throughput with at-least-once delivery and no ordering guarantee. FIFO gives ordering within a message group and exactly-once processing, with lower throughput by default. *(See Messaging.)*

**38. What is a dead-letter queue?**
A queue that receives messages that failed processing more than `maxReceiveCount` times. It isolates poison messages and lets you investigate and redrive them. *(See Messaging.)*

**39. Why must consumers be idempotent?**
Standard SQS and SNS deliver at least once, so duplicates happen. Processing the same message twice must have the same effect as once, usually by recording processed IDs or using conditional writes. *(See Messaging.)*

## Monitoring and operations

**40. CloudWatch metrics, logs, alarms: how do they fit?**
Metrics are numeric time series. Logs are text or JSON events. Alarms watch metrics and trigger notifications or auto scaling. Structured logs make Logs Insights queries practical. *(See Monitoring.)*

**41. CloudTrail vs CloudWatch?**
CloudTrail records API calls (who did what). CloudWatch records metrics and logs about resources and applications. *(See Monitoring.)*

**42. How would you detect a leaked access key?**
GuardDuty flags unusual API activity from the key. Access Analyzer and the IAM credential report show unused or external access. Deactivate the key, review CloudTrail for its activity, rotate, and find the leak source. *(See Monitoring and [IAM](/AWS/IAM).)*

**43. What is the difference between Secrets Manager and Parameter Store?**
Secrets Manager has built-in rotation for supported databases and costs per secret. Parameter Store is cheaper for general configuration and supports encrypted SecureString values without built-in rotation. *(See Monitoring.)*

## Infrastructure as Code

**44. CloudFormation vs Terraform?**
CloudFormation is AWS-native with no state file to manage and built-in drift detection. Terraform works across many providers, needs remote state with locking, and has a large module ecosystem. *(See IaC.)*

**45. What is a CDK construct?**
A reusable building block in CDK that represents one or more AWS resources with sensible defaults. The app synthesises constructs to CloudFormation. *(See IaC.)*

**46. How do you avoid accidental data loss from IaC?**
Read every plan, use `DeletionPolicy: Retain` or `prevent_destroy`, enable deletion protection on databases, and use remote state with locking. *(See IaC.)*

## Scenario questions

**47. Design a highly available web API on AWS.**
Route 53 to an ALB in public subnets across two or more AZs. ECS on Fargate (or an ASG on EC2) in private subnets, with target tracking autoscaling and a health check grace period. RDS Multi-AZ or Aurora in database subnets. ElastiCache for session data. Secrets in Secrets Manager, logs and metrics in CloudWatch with alarms, WAF on the ALB, and CloudFront in front for static content.

**48. A customer uploads a file and it must be processed within a minute. How?**
Presigned upload URL to S3, S3 event notification to SQS, a consumer (Lambda or ECS service) that processes with retries and a DLQ, results written to DynamoDB or S3, and a notification via SNS. Alarm on queue age and DLQ depth.

**49. Your API started returning 502 errors after a deployment. Walk through the diagnosis.**
1. Check ECS service events and the deployment state (or the rollout in EKS)
2. Check ALB target health and the health check path
3. Check CloudWatch logs for startup errors and the ALB access logs for 502 patterns
4. Check security groups between ALB and tasks (port and source)
5. Roll back with the circuit breaker, or update the service to the previous task definition revision

**50. How would you reduce a monthly AWS bill that jumped 40%?**
Use Cost Explorer grouped by service and by tag to find the driver. Common causes: NAT Gateway data transfer (add VPC endpoints), unattached EBS volumes and old snapshots, oversized or always-on RDS instances, unbounded CloudWatch Logs retention, S3 storage without lifecycle rules, and forgotten load balancers. Then add budgets and anomaly alerts, and commit to Savings Plans for the stable baseline.

**51. How do you secure a multi-account environment?**
Organizations with separate accounts per environment and per security function; SCPs for guardrails (deny disabling CloudTrail, restrict regions); IAM Identity Center for people; roles for workloads; centralized CloudTrail, GuardDuty and Security Hub in a security account; encryption with customer managed KMS keys; and IaC with reviewed pipelines.

**52. A Lambda function times out intermittently when calling an RDS database. What do you check?**
Connection exhaustion: each invocation opens a new connection, so the database hits its max connections. Use RDS Proxy, reuse connections across warm invocations by creating them outside the handler, and check the Lambda is in the same VPC with routes to the database subnet. Also check the timeout against the query time and the concurrency limit.

## Cloud models, console and billing

**53. Explain IaaS, PaaS and SaaS with AWS examples.**
IaaS gives you virtual infrastructure (EC2, VPC, EBS) and you manage the OS and above. PaaS gives you a platform so you manage only the application and data (Elastic Beanstalk, Lambda, RDS). SaaS is a finished application (WorkMail, Connect, QuickSight). *(See Cloud Models.)*

**54. What is pay-as-you-go, and what are the usual causes of surprise bills?**
You pay for what you use, by the second, hour, request or GB. Surprises usually come from instances left running, NAT Gateway data processing, data transfer out, idle load balancers, unattached volumes, and unbounded log retention. *(See Cloud Models.)*

**55. How do you choose a region?**
In order: data residency and compliance, latency to users, service availability in that region, and price. Resources are regional, so a resource in one region is invisible in another. *(See Cloud Models.)*

**56. How do you get warned before a cost overrun?**
Create an AWS Budget with email notifications on actual and forecasted spend, and enable Cost Anomaly Detection. Use cost allocation tags to see which team or environment is driving the bill. *(See Cloud Models.)*

## Security and identity additions

**57. What does MFA protect against, and how do you enforce it?**
It protects against password theft and phishing. Enforce it with IAM policies that deny actions when `aws:MultiFactorAuthPresent` is false, and require hardware keys for root and administrators. *(See [IAM](/AWS/IAM).)*

**58. CloudTrail vs AWS Config?**
CloudTrail records API activity (who did what, when, from where). Config records resource configuration over time and evaluates compliance rules. Use CloudTrail to investigate actions and Config to prove compliance or find drift. *(See Auditing.)*

**59. How would you prove that CloudTrail logs have not been tampered with?**
Enable log file validation (digest files), store logs in a bucket protected by Object Lock and a deny-delete policy, and centralise them in a separate log-archive account. *(See Auditing.)*

## Compute additions

**60. Compare EC2 pricing models.**
On-Demand is pay-per-use with no commitment. Savings Plans and Reserved Instances give large discounts for a one- or three-year commitment, with Savings Plans more flexible. Spot gives the deepest discount but can be interrupted with a two-minute notice. *(See Compute.)*

**61. What is an AMI?**
The template for an instance: the root volume contents, launch permissions, and block device mappings. You can use AWS-provided, Marketplace, or custom golden images, which EC2 Image Builder can build and patch automatically. *(See Compute.)*

**62. When would you choose Elastic Beanstalk over ECS?**
Beanstalk for a standard web application where you want managed deployments with little infrastructure design. ECS on Fargate when you need container-level control, service mesh integration or a more customised architecture. *(See Compute.)*

## Storage additions

**63. EBS vs EFS vs S3?**
EBS is block storage attached to one instance in one AZ. EFS is a shared NFS file system mounted by many instances and containers across AZs. S3 is object storage accessed over HTTP. *(See EBS and EFS.)*

**64. Why does an EBS volume not attach to an instance in another AZ?**
Volumes exist in one AZ and can only attach to instances in that AZ. To move data, snapshot the volume and create a new one in the target AZ. *(See EBS and EFS.)*

**65. How do you host a static website in S3 securely with HTTPS?**
Serve the bucket through CloudFront with Origin Access Control, keep the bucket private, and map a custom domain in Route 53 to the distribution with an ACM certificate in us-east-1. The S3 website endpoint alone is HTTP only. *(See [S3](/AWS/S3) and Load Balancing.)*

## Networking and delivery additions

**66. ALB vs NLB?**
ALB works at layer 7 for HTTP and gRPC with path and host routing, and is the default for web apps and containers. NLB works at layer 4 for TCP and UDP, with static IP addresses and very high throughput. *(See Load Balancing.)*

**67. Name the Route 53 routing policies.**
Simple, weighted, latency, failover, geolocation, geoproximity and multivalue answer. *(See Load Balancing.)*

**68. What is an alias record and why use it?**
An AWS-specific record that points to an AWS resource such as an ALB or CloudFront distribution. It works at the zone apex and does not incur query charges. *(See Load Balancing.)*

**69. How does CloudFront keep a private S3 bucket private?**
Origin Access Control lets only the CloudFront distribution read objects. The bucket policy allows the CloudFront service principal, scoped to the distribution's ARN. *(See Load Balancing.)*

## Databases and data warehousing

**70. When would you choose Redshift over Aurora?**
Redshift for analytical queries that scan and aggregate large history, using columnar storage and parallel processing. Aurora for transactional workloads with many small reads and writes. *(See Databases.)*

**71. What makes Redshift queries fast?**
Columnar storage with compression, distribution keys that colocate joins, sort keys that prune blocks for range filters, and bulk loading with `COPY` from compressed columnar files. *(See Databases.)*

## CI/CD

**72. What do CodeBuild, CodeDeploy and CodePipeline each do?**
CodeBuild runs build and test commands from `buildspec.yml`. CodeDeploy rolls out a revision to EC2, ECS or Lambda with health checks and rollback. CodePipeline sequences source, build, deploy and approval stages. *(See CI/CD.)*

**73. Is CodeCommit still a good choice for a new project?**
AWS stopped offering CodeCommit to new customers in 2024. For new projects, use GitHub, GitLab or Bitbucket connected through AWS CodeConnections. *(See CI/CD.)*

**74. How do you promote the same artifact through environments?**
Build once, tag the image with the commit SHA, push to ECR, and deploy that exact image to staging and then production. Gate production with a manual approval stage. *(See CI/CD.)*

## Generative AI and machine learning

**75. Bedrock vs SageMaker?**
Bedrock is a managed API to foundation models, used to add generative features quickly, with Knowledge Bases, Agents and Guardrails. SageMaker is a platform for building, training and hosting your own ML models. *(See Generative AI.)*

**76. What is retrieval-augmented generation and how does Bedrock support it?**
RAG retrieves relevant chunks of your own documents at query time and gives them to the model with the question, so answers are grounded and can cite sources. Bedrock Knowledge Bases handles ingestion, embedding, the vector store and retrieval. *(See Generative AI.)*

**77. Does Bedrock use your prompts to train models?**
AWS states that customer prompts and outputs are not used to train the foundation models it provides. Control access with IAM on specific model ARNs, use VPC endpoints for private traffic, and use guardrails for content policy. *(See Generative AI.)*

**78. How do you control the cost of SageMaker?**
Use managed spot training with checkpoints, autoscaling or serverless inference, batch transform for offline scoring, and delete endpoints and stop notebooks when idle. *(See Generative AI.)*

## Quick-fire

- **Default VPC?** Created per region with public subnets; fine for experiments, not for production design.
- **Elastic IP?** A static public IPv4 address. AWS charges for ones that are not attached to a running resource.
- **Route 53 routing policies?** Simple, weighted, latency-based, failover, geolocation, geoproximity, multivalue.
- **CloudFront?** A CDN with edge caching; use Origin Access Control to keep S3 origins private.
- **API Gateway HTTP API vs REST API?** HTTP APIs are cheaper and faster with fewer features; REST APIs support more features like usage plans and request validation.
- **Step Functions?** Orchestrates multi-step workflows with retries, branching and waits.
- **Backup?** AWS Backup gives a central policy across RDS, DynamoDB, EFS, EBS and more.
- **Well-Architected Tool?** Free review of a workload against the pillars.
