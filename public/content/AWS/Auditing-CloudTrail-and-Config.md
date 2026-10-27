# AWS: Auditing and Compliance (CloudTrail and Config)

Two services answer two different audit questions:

| Question | Service | What it records |
|---|---|---|
| **Who did what, and when?** | **AWS CloudTrail** | Every API call made in your account: caller, time, source IP, parameters, result |
| **What does the configuration look like, and did it change?** | **AWS Config** | The state of each resource over time, and whether it complies with rules you define |

Use CloudTrail for investigation ("who deleted this bucket?") and Config for compliance ("is every bucket encrypted, and has any bucket become public?").

## AWS CloudTrail

### Concepts

| Term | Meaning |
|---|---|
| **Event** | One API call, recorded as JSON |
| **Event history** | 90 days of management events, viewable without setup |
| **Trail** | A configuration that delivers events to an S3 bucket (and optionally CloudWatch Logs) indefinitely |
| **Management events** | Control plane actions: creating a bucket, changing a security group |
| **Data events** | Data plane actions: S3 object reads and writes, Lambda invocations (charged, opt-in) |
| **Organization trail** | One trail that covers every account in AWS Organizations |

### Create an organization trail

Run this from the management account, with a central S3 bucket in a dedicated log-archive account:

```bash
aws cloudtrail create-trail \
  --name org-audit-trail \
  --s3-bucket-name org-cloudtrail-logs-123456789012 \
  --is-multi-region-trail \
  --is-organization-trail \
  --enable-log-file-validation

aws cloudtrail start-logging --name org-audit-trail
aws cloudtrail get-trail-status --name org-audit-trail --query "IsLogging"
```

```output
true
```

`--enable-log-file-validation` produces digest files so you can prove the logs were not altered. Protect the bucket with Object Lock and a bucket policy that denies deletion.

### Search events

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket \
  --max-results 5 \
  --query "Events[].[EventTime,Username,EventName,SourceIPAddress]" --output table
```

For larger searches use **CloudTrail Lake** (SQL over events) or Athena over the S3 logs:

```sql
SELECT eventtime, useridentity.arn, eventname, sourceipaddress
FROM cloudtrail_logs
WHERE eventname = 'ConsoleLogin'
  AND errorcode IS NULL
  AND eventtime > '2026-10-01T00:00:00Z'
```

### Reading an event

```json
{
  "eventTime": "2026-10-26T18:02:11Z",
  "eventName": "DeleteBucket",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::123456789012:assumed-role/Developer/orders-dev"
  },
  "sourceIPAddress": "203.0.113.25",
  "requestParameters": { "bucketName": "orders-exports-dev" },
  "responseElements": null,
  "errorCode": null
}
```

The `userIdentity` tells you the role session, not just the role. Pair it with the session name to find the person.

### Alert on sensitive actions

Send CloudTrail events to CloudWatch Logs, then create a metric filter and an alarm:

```bash
aws logs put-metric-filter \
  --log-group-name CloudTrail/management \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations metricName=RootAccountUsage,metricNamespace=Security,metricValue=1
```

Good candidates for alarms: root account use, console logins without MFA, changes to CloudTrail itself (`StopLogging`, `DeleteTrail`), security group changes that open `0.0.0.0/0`, and IAM policy changes.

## AWS Config

### What it does

Config records the configuration of supported resources, keeps a history of each change, and evaluates **rules** against the configuration. It answers "what did this security group look like last Tuesday?" and "which buckets are non-compliant right now?"

| Component | Purpose |
|---|---|
| **Configuration recorder** | Captures resource configuration changes |
| **Delivery channel** | Sends snapshots and history to an S3 bucket |
| **Config rules** | Managed or custom checks, evaluated on change or periodically |
| **Conformance packs** | Bundles of rules for a standard (CIS, PCI DSS, NIST) |
| **Aggregator** | Combines data across accounts and regions |
| **Remediation** | Runs an SSM Automation document to fix a non-compliant resource |

### Enable recording and a managed rule

```bash
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::123456789012:role/aws-config-role \
  --recording-group allSupported=true,includeGlobalResourceTypes=true

aws configservice put-delivery-channel \
  --delivery-channel name=default,s3BucketName=config-logs-123456789012

aws configservice start-configuration-recorder --configuration-recorder-name default

aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "s3-bucket-public-read-prohibited",
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "S3_BUCKET_PUBLIC_READ_PROHIBITED"
  },
  "Scope": { "ComplianceResourceTypes": ["AWS::S3::Bucket"] }
}'

aws configservice describe-compliance-by-config-rule \
  --config-rule-names s3-bucket-public-read-prohibited \
  --query "ComplianceByConfigRules[0].Compliance.ComplianceType"
```

```output
"COMPLIANT"
```

### Config history: what changed?

```bash
aws configservice get-resource-config-history \
  --resource-type AWS::EC2::SecurityGroup \
  --resource-id sg-0app00000000000b \
  --limit 3 \
  --query "configurationItems[].[configurationItemCaptureTime,configurationItemStatus]" --output table
```

Pair this with CloudTrail: Config tells you the security group changed and what it looks like now; CloudTrail tells you who changed it.

### Auto-remediation

Attach an SSM Automation document so a non-compliant resource is fixed without waiting for a person. For example, the managed `AWS-DisableS3BucketPublicReadWrite` document blocks public access on a non-compliant bucket. Keep remediation for clear, safe fixes, and alert humans for anything that could break a workload.

## CloudTrail vs Config vs CloudWatch

| | CloudTrail | Config | CloudWatch |
|---|---|---|---|
| Records | API calls (actions) | Resource state (configuration) | Metrics, logs, alarms |
| Answers | Who did it? | What is it now, and what was it? Is it compliant? | How is it performing? |
| Typical use | Investigation, audit trail | Compliance and drift | Operations and alerting |

## Compliance frameworks

| Framework | Relevant AWS tooling |
|---|---|
| CIS AWS Foundations Benchmark | Security Hub standard, Config conformance pack |
| PCI DSS | Config conformance pack, Security Hub standard |
| SOC 2 / ISO 27001 | Evidence from CloudTrail, Config history, and AWS Artifact reports |
| HIPAA | AWS Artifact BAA; encryption and logging controls as above |

AWS Artifact provides AWS's own compliance reports (SOC, ISO, PCI attestations) on demand. You still need evidence for your own controls, which is what Config and CloudTrail provide.

## Key takeaways

- CloudTrail records who did what; enable an organization trail with log file validation and protected storage.
- Config records configuration history and checks it against rules; use it for compliance and drift detection.
- Alert on root use, trail changes, and security group openings.
- Use CloudTrail to find the actor and Config to see the resulting state; they are complementary.
