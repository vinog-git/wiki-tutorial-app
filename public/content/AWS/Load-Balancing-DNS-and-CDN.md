# AWS: Load Balancing, DNS and CDN

Users reach your application through three layers: DNS (Route 53) finds the entry point, a CDN (CloudFront) serves cached content close to the user, and a load balancer (ELB) spreads requests across healthy instances. Auto Scaling changes how many instances sit behind the load balancer.

```
User ──▶ Route 53 (DNS: app.example.com)
          │
          ├─▶ CloudFront (CDN: cached static content, TLS at the edge)
          │        │
          │        ▼
          └─▶ Application Load Balancer (distributes requests)
                   │
                   ▼
              Target group ──▶ EC2 / ECS tasks / EKS pods / Lambda
                   ▲
              Auto Scaling group adds and removes targets
```

## Elastic Load Balancing (ELB)

### Load balancer types

| Type | Layer | Protocols | Use for |
|---|---|---|---|
| **Application Load Balancer (ALB)** | 7 | HTTP, HTTPS, gRPC, WebSocket | Web apps and APIs; path and host routing; default for containers |
| **Network Load Balancer (NLB)** | 4 | TCP, UDP, TLS | Very high throughput, static IP addresses, non-HTTP protocols |
| **Gateway Load Balancer (GWLB)** | 3 | GENEVE | Inline firewalls and appliances |
| **Classic Load Balancer** | 4 and 7 | Legacy | Previous generation; use ALB or NLB for new work |

### Building blocks

| Component | Purpose |
|---|---|
| **Listener** | Port and protocol the load balancer accepts (for example HTTPS:443) |
| **Rule** | Routes a request by host, path, header or query string to a target group |
| **Target group** | A set of targets (instances, IPs, Lambda functions) and their health check |
| **Health check** | Path and expected response; unhealthy targets receive no traffic |
| **Target type** | `instance`, `ip` (for ECS Fargate and EKS pods), `lambda`, or `alb` |

### Create an ALB with HTTPS and a health check

```bash
ALB=$(aws elbv2 create-load-balancer --name orders-alb \
  --subnets subnet-0aaa1111bbb22222c subnet-0bbb2222ccc33333d \
  --security-groups sg-0alb000000000000d --scheme internet-facing --type application \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)

TG=$(aws elbv2 create-target-group --name orders-tg --protocol HTTP --port 8080 \
  --vpc-id vpc-0a1b2c3d4e5f67890 --target-type ip \
  --health-check-path /actuator/health/readiness --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
  --query "TargetGroups[0].TargetGroupArn" --output text)

aws elbv2 create-listener --load-balancer-arn $ALB --protocol HTTPS --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/abcd-1234 \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=$TG

aws elbv2 describe-target-health --target-group-arn $TG \
  --query "TargetHealthDescriptions[].[Target.Id,TargetHealth.State]" --output table
```

```output
-----------------------------------------
|          DescribeTargetHealth         |
+---------------+-----------------------+
|  10.0.11.42   |  healthy              |
|  10.0.12.87   |  healthy              |
+---------------+-----------------------+
```

### Path-based routing

One ALB can serve several services:

```bash
aws elbv2 create-rule --listener-arn <listener-arn> --priority 10 \
  --conditions Field=path-pattern,Values='/orders/*' \
  --actions Type=forward,TargetGroupArn=$TG
```

### Redirect HTTP to HTTPS

```bash
aws elbv2 create-listener --load-balancer-arn $ALB --protocol HTTP --port 80 \
  --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'
```

### Connection draining and stickiness

- **Deregistration delay** (default 300 seconds) lets in-flight requests finish before a target is removed. Shorten it for fast deployments.
- **Stickiness** pins a user to one target. Avoid it when the app is stateless; it hides uneven load and complicates scaling.

## Auto Scaling groups

An Auto Scaling group (ASG) keeps a fleet of EC2 instances at a desired size, replaces unhealthy ones, and registers new instances with the target group. The launch template and scaling policies are covered on the Compute page.

```bash
aws autoscaling attach-load-balancer-target-groups \
  --auto-scaling-group-name orders-asg --target-group-arns $TG

aws autoscaling update-auto-scaling-group --auto-scaling-group-name orders-asg \
  --health-check-type ELB --health-check-grace-period 120
```

Set `health-check-type ELB` so an instance that fails the load balancer's health check is replaced, not only one that fails the EC2 status check.

## Amazon Route 53 (DNS)

Route 53 is AWS's DNS service. It is highly available, globally distributed, and integrates with AWS resources through alias records.

### Concepts

| Term | Meaning |
|---|---|
| **Hosted zone** | Container for DNS records for a domain. Public or private (attached to VPCs). |
| **Record** | A, AAAA, CNAME, MX, TXT, and so on |
| **Alias record** | AWS-specific record that points to an ALB, CloudFront, S3 website, or another record. Free to query and works at the zone apex. |
| **Health check** | Probes an endpoint; routing policies can skip failed endpoints |
| **Domain registration** | Buy and manage domains (or transfer in) |

### Routing policies

| Policy | Behaviour | Use for |
|---|---|---|
| **Simple** | One record, one or several values | Single endpoint |
| **Weighted** | Split traffic by weight | Canary releases, A/B tests |
| **Latency** | Send users to the lowest-latency region | Multi-region apps |
| **Failover** | Primary and secondary, switched on health check | Disaster recovery |
| **Geolocation** | By user country or continent | Compliance, localised content |
| **Geoproximity** | By distance, with bias | Shifting traffic between regions |
| **Multivalue answer** | Up to eight healthy records returned at random | Simple client-side spread |

### Example: alias to the ALB and a weighted canary

```bash
ZONE=Z0123456789ABCDEFGHIJ
ALB_DNS=orders-alb-1234567890.us-east-1.elb.amazonaws.com
ALB_ZONE=Z35SXDOTRQ7X7K

cat > change.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "api.example.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "$ALB_ZONE",
        "DNSName": "$ALB_DNS",
        "EvaluateTargetHealth": true
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets --hosted-zone-id $ZONE --change-batch file://change.json
dig +short api.example.com
```

```output
52.20.14.106
34.231.90.12
```

Route 53 record changes take effect in seconds, but resolvers cache answers for the record's TTL. Lower the TTL before a planned cutover.

## Amazon CloudFront (CDN)

CloudFront caches content at edge locations worldwide and forwards cache misses to an **origin**. It also terminates TLS close to the user, and can run small functions at the edge.

### Concepts

| Term | Meaning |
|---|---|
| **Distribution** | The CloudFront configuration: origins, behaviours, cache policies |
| **Origin** | Where content comes from: an S3 bucket, an ALB, an API Gateway, or any HTTP server |
| **Behaviour** | Rules that match a path pattern and set cache and origin settings |
| **Cache policy** | TTLs and which headers, cookies and query strings form the cache key |
| **Origin Access Control (OAC)** | Lets CloudFront read a private S3 bucket; the bucket stays private |
| **Invalidation** | Removes cached objects before their TTL expires |
| **CloudFront Functions / Lambda@Edge** | Code that runs at the edge to rewrite requests or responses |

### Serve a private S3 bucket through CloudFront

Use OAC so the bucket can stay fully private (no public access, no website endpoint):

```bash
aws cloudfront create-origin-access-control --origin-access-control-config '{
  "Name": "site-oac",
  "OriginAccessControlOriginType": "s3",
  "SigningBehavior": "always",
  "SigningProtocol": "sigv4"
}'
```

Then create the distribution with the S3 origin using that OAC ID, and add a bucket policy that allows only the CloudFront service principal, scoped to this distribution:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontRead",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::site-bucket-123456789012/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/E1ABCDEF234567"
      }
    }
  }]
}
```

Invalidate after a deploy:

```bash
aws cloudfront create-invalidation --distribution-id E1ABCDEF234567 --paths "/index.html" "/assets/*"
```

### Cache-friendly design

- Put a version in the file name (`app.3f9c1a.js`) so long TTLs are safe and invalidations are rare.
- Cache static assets for a long time, HTML for a short time.
- Include only the headers and query strings that change the response in the cache key.

### TLS and custom domains

Certificates for CloudFront must be in **us-east-1** in ACM. Attach the certificate and an alternate domain name (CNAME) to the distribution, then point `www.example.com` at the distribution with an alias record in Route 53.

## Putting it together: a typical web stack

| Layer | Service | Notes |
|---|---|---|
| DNS | Route 53 | Alias records to CloudFront and ALB; health checks |
| Edge | CloudFront | Static assets from S3 (OAC); API paths passed to the ALB; TLS |
| Load balancing | ALB | HTTPS listener; path rules; health checks on readiness |
| Compute | ECS on Fargate or EC2 ASG | Target type `ip` for Fargate |
| Data | Aurora or RDS in private subnets | Security groups reference the app tier |

## Non-Functional Requirements and Disaster Recovery

The load balancing layer decides how quickly traffic leaves a failed instance or region. For a 5-minute recovery it must detect a failure in about 30 seconds and move traffic within about a minute.

### Non-functional requirements

| Requirement | Target | How this layer meets it |
|---|---|---|
| No single point of failure | Survives the loss of an AZ | ALB in at least two AZs, with targets in each |
| Failed instance removed | Under 30 seconds | Target group health check every 10 seconds; unhealthy after 2 failures |
| Region failover | Traffic moved within about a minute of detection | Route 53 failover records with fast health checks and a short TTL |
| Static content during an origin outage | Keeps serving | CloudFront caches at the edge; origin groups send requests to a second origin on selected error codes |

### Tighten the health checks

The default ALB health check interval is 30 seconds, so an instance can keep taking traffic for a long time after it fails. A 10-second interval with 2 failures brings that down to about 20 seconds:

```bash
aws elbv2 modify-target-group \
  --target-group-arn "$TG_ARN" \
  --health-check-interval-seconds 10 \
  --unhealthy-threshold-count 2
```

For region failover, create a health check on the regional endpoint. Fast mode checks every 10 seconds, and the failure threshold defaults to 3:

```bash
aws route53 create-health-check \
  --caller-reference "api-use1-$(date +%s)" \
  --health-check-config '{"Type":"HTTPS","FullyQualifiedDomainName":"api-use1.example.com","ResourcePath":"/health","Port":443,"RequestInterval":10,"FailureThreshold":3}'
```

Attach the check to the PRIMARY failover record. The SECONDARY record points at the standby region. For failover records that are not aliases, set the TTL to 60 seconds or less. Alias records take their TTL from their target.

> Some clients keep using an old DNS answer past its TTL. As a rough estimate, plan for up to about 90 seconds of DNS delay. The time budget in [Microservices Architecture](/Java/Microservices-Architecture) leaves room for it.

Point the health check at an endpoint that checks the instance and its essential dependencies, not every dependency. If a shared database is slow, a deep health check can pull a whole region out of DNS.

## Key takeaways

- A 5-minute failover needs a 10-second health check interval, a DNS TTL of 60 seconds or less, and a standby that is already running.
- ALB for HTTP routing and containers; NLB for TCP, UDP and static IPs; choose by protocol and routing needs.
- Health checks decide what gets traffic; point them at a readiness endpoint, not a heavy dependency check.
- Route 53 alias records are the AWS-native way to point names at AWS resources; choose a routing policy for failover, canaries or latency.
- CloudFront with OAC serves private S3 content at the edge; cache static assets with versioned file names.
