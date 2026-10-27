# AWS: Monitoring, Secrets and Security Services

Running workloads on AWS means knowing what they are doing (CloudWatch, X-Ray), keeping credentials out of code (Secrets Manager, Parameter Store), encrypting data with keys you control (KMS), and detecting threats (GuardDuty, Security Hub, CloudTrail).

## CloudWatch

CloudWatch collects metrics, logs and alarms.

> **See also:** for keeping container logs after a crash, and writing logs that stay useful, see the Docker section's *Logging and Preserving Logs* page. For Prometheus and Grafana dashboards over the same data, see the Grafana section.

| Feature | What it does |
|---|---|
| **Metrics** | Numeric time series, e.g. `CPUUtilization`, `5XXError`, `ApproximateNumberOfMessagesVisible` |
| **Logs** | Log groups and streams from apps, Lambda, ECS, API Gateway, VPC Flow Logs |
| **Logs Insights** | Query logs with a SQL-like language |
| **Alarms** | Notify or act when a metric crosses a threshold |
| **Dashboards** | Visual summaries |
| **Container Insights** | ECS and EKS metrics and logs out of the box |
| **Synthetics** | Scheduled canary scripts that test endpoints |

### Create an alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name orders-5xx-high \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=LoadBalancer,Value=app/orders-alb/abc123 \
  --statistic Sum --period 60 --evaluation-periods 3 --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:oncall-alerts
```

### Query logs

```
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(5m)
| sort @timestamp desc
| limit 50
```

Run it in Logs Insights, or from the CLI:

```bash
aws logs start-query --log-group-name /ecs/orders-service \
  --start-time $(date -d '-1 hour' +%s) --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | limit 20'
```

### Structured logs

Log JSON, not free text. Logs Insights can then filter on fields directly, and the logs are easier to search with any tool.

```json
{"level":"ERROR","service":"orders","orderId":"o-1001","msg":"payment declined","latencyMs":842}
```

```
fields @timestamp, orderId, msg
| filter level = "ERROR" and latencyMs > 500
```

### Log retention

CloudWatch Logs keep data forever by default, and that costs money. Set retention per group:

```bash
aws logs put-retention-policy --log-group-name /ecs/orders-service --retention-in-days 30
```

## X-Ray and tracing

AWS X-Ray traces a request across services and shows where time goes. Instrument with the AWS Distro for OpenTelemetry (ADOT) for a vendor-neutral option. Trace IDs also help correlate logs across services.

## Secrets: Secrets Manager vs Parameter Store

| | Secrets Manager | Systems Manager Parameter Store |
|---|---|---|
| Purpose | Credentials, API keys, DB passwords | Configuration and secrets |
| Automatic rotation | Yes, built in for RDS, Redshift, DocumentDB | No (manual or your own Lambda) |
| Cost | Per secret per month plus API calls | Standard tier free; advanced tier paid |
| Max value size | 64 KB | 4 KB standard, 8 KB advanced |
| Best for | Database credentials that must rotate | Feature flags, endpoints, non-rotating config |

```bash
# Store a secret
aws secretsmanager create-secret --name prod/orders/db \
  --secret-string '{"username":"orders_app","password":"use-generated-value"}'

# Read it
aws secretsmanager get-secret-value --secret-id prod/orders/db \
  --query SecretString --output text

# Parameter Store, encrypted with KMS
aws ssm put-parameter --name /prod/orders/payment-url \
  --value "https://payments.internal" --type String
aws ssm put-parameter --name /prod/orders/api-key \
  --value "placeholder" --type SecureString --overwrite
```

Reference secrets from ECS task definitions (`secrets` with `valueFrom`) or read them in code with the SDK. Never print them, and never put them in environment files in git.

```python
import json
import boto3

sm = boto3.client("secretsmanager", region_name="us-east-1")

def get_db_credentials(secret_id: str) -> dict:
    value = sm.get_secret_value(SecretId=secret_id)["SecretString"]
    return json.loads(value)
```

## KMS: encryption keys

AWS Key Management Service holds keys used to encrypt data. Most services accept a KMS key for encryption at rest (S3, EBS, RDS, DynamoDB, Secrets Manager, SQS).

| Key type | Who manages | Notes |
|---|---|---|
| AWS managed keys (`aws/s3` etc.) | AWS | Free, no key policy control, limited audit |
| Customer managed keys (CMK) | You | Key policy, rotation, can be disabled, audited in CloudTrail |

Key policies control who can use the key. Access needs both the key policy and the caller's IAM permissions to allow it.

```bash
aws kms create-key --description "orders data encryption"
aws kms create-alias --alias-name alias/orders-data --target-key-id <key-id>
aws kms enable-key-rotation --key-id <key-id>
```

**Envelope encryption:** KMS does not encrypt large data directly. It generates a data key, encrypts the data with it, and stores the encrypted data key with the data. The SDK does this for you in S3 and DynamoDB client-side encryption.

## Audit: CloudTrail

CloudTrail records API calls: who did what, from where, and when. It is the first place to look after a security event.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket \
  --max-results 5 \
  --query "Events[].[EventTime,Username,EventName]" --output table
```

```output
---------------------------------------------------------------
|                         LookupEvents                        |
+---------------------------+-----------------+---------------+
|  2026-10-26T18:02:11Z     |  orders-dev     |  DeleteBucket |
+---------------------------+-----------------+---------------+
```

Enable an **organization trail** that writes to a central, immutable S3 bucket in a security account. Turn on log file validation.

## Threat detection and posture

| Service | What it finds |
|---|---|
| **GuardDuty** | Suspicious activity: compromised credentials, crypto mining, unusual API calls, S3 data exfiltration patterns |
| **Security Hub** | Aggregates findings and checks against standards (CIS, AWS Foundational Security Best Practices) |
| **Inspector** | Vulnerabilities in EC2, ECR images, and Lambda code |
| **Config** | Records resource configuration and evaluates rules (for example, "S3 buckets must not be public") |
| **Macie** | Finds sensitive data (PII) in S3 |
| **Access Analyzer** | Resources shared outside your account or organization |
| **WAF and Shield** | Web application firewall rules; DDoS protection |

## Putting it together: a secure service checklist

1. Workload runs with a role, not access keys (IAM page)
2. Secrets from Secrets Manager, referenced at runtime
3. Data encrypted at rest with a customer managed KMS key
4. Traffic over TLS; security groups reference other groups
5. Logs are structured, retained for a set period, and alarmed on errors
6. Traces enabled (X-Ray or ADOT)
7. CloudTrail and GuardDuty on in every account
8. Images scanned in ECR; findings reviewed in Inspector or Security Hub

## Key takeaways

- CloudWatch: metrics for alarms, logs for debugging, structured JSON for searching.
- Secrets Manager for credentials that rotate; Parameter Store for config.
- KMS customer managed keys give control and an audit trail for encryption.
- CloudTrail answers "who did that". GuardDuty and Security Hub find the bad things.
