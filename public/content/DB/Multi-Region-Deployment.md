# DB: Multi-Region Deployment

This topic covers running the same application in two or more regions, for example `us-east-1` and `ca-central-1`, and shipping changes to all of them safely. For what the data looks like and where it lives, see [Multi-Region Database Design](/DB/Multi-Region-Database-Design).

## Deployment topologies

| Topology | How it works | Pros | Cons |
|---|---|---|---|
| **Single region with DR** | All traffic in the primary region; a standby elsewhere | Simple and cheapest | The standby sits idle; failover takes time; far users have latency |
| **Active-passive** | The primary serves; the standby takes over on failure | Clear ownership of writes | Failover is an event you must rehearse; the standby must stay current |
| **Active-active by tenant** | Each tenant is homed in one region; every region serves traffic | Low latency for each tenant; no write conflicts | Routing and per-region capacity to manage |
| **Active-active by row** | Any region writes any data | Lowest latency everywhere | Conflict resolution; residency is hard; hardest correctness |

As a rule of thumb: use active-passive with DR for a customer base in one country, and active-active by tenant for customers whose tenants are regional. Active-active by row is rarely worth it.

## What each region contains

Each region is a complete stack, so the failure of one region does not take down another:

- A load balancer and TLS termination.
- Stateless application instances across at least two availability zones.
- A database cluster: a primary with a synchronous standby in another zone, and an asynchronous cross-region replica for DR where residency allows it.
- Caches, queues and object storage local to the region.
- Logs, metrics and traces shipped to storage the region can reach. Logs often contain personal data, so they fall under residency rules too.

## Global routing

- **DNS-based routing**, using latency or geolocation records, sends each user to the nearest healthy region. DNS caches do not always respect short TTLs, so expect some slow switching.
- **Anycast or a global accelerator** routes at the network level and fails over quickly.
- **Tenant-aware routing**: the entry point looks up the tenant's home region in the directory and forwards the request. This is what handles a US user of a Canadian-homed tenant.

Route residency-sensitive traffic to the home region even when it is farther away. Latency is the cost of residency.

Health checks should run from several places. One failed probe must not trigger a region failover.

## Failover

- Define the trigger in advance: how many minutes of failed health checks, which errors, and who approves the switch.
- Automate the routing change. Promoting a database with asynchronous replication is often a manual step, and it can lose the writes not yet replicated.
- Agree the **RTO** (how long the service may be down) and the **RPO** (how much recent data may be lost) with the business, per tenant tier. Write them down.
- Fail back deliberately, once the primary is healthy and caught up. Do not flap between regions.

## Deploying code to many regions

Stage the rollout so a bad release is caught in one place first:

1. Deploy to a canary: a small slice of traffic in one region.
2. Watch error rate, latency and business metrics for an agreed period.
3. Roll out to the rest of that region, then to the next region, never to all at once.
4. Keep the previous version deployable so rollback is quick.

Build the artifact once and deploy the same image everywhere. Configure each region through environment variables or a config store. Rebuilding per region means you are deploying different code in each place.

Per-region configuration includes the region name, the directory endpoint, feature flags and secrets from a regional secret store. Secrets do not cross regions unless policy allows it.

Infrastructure is defined once, as code, and parameterized by region. See [AWS: Infrastructure as Code](/AWS/Infrastructure-as-Code). Hand-built regions drift apart.

## Database migrations across regions

- Use expand-then-contract. Add the new columns and code that handles both shapes, deploy, backfill, and remove the old shape in a later release.
- Within one region's database, a migration on the primary reaches its standby through replication.
- Each region's database is migrated separately, in the same order, once the previous region is healthy.
- Never make a migration that requires every region to switch at the same instant.

## Residency-aware deployment

- Store Canadian-homed data only in Canadian regions. Check that logs, backups and metrics that contain personal data also stay in-country, if the rule covers them.
- CI/CD pipelines and their artifacts can pass through other regions. Check the policy, especially for secrets and for personal data in test fixtures.
- Keep an inventory of which service runs in which region and which data class it handles.

## Testing

- Run a game day: take a region down, in staging or in a controlled production window. Confirm that routing moves, that the data loss matches the RPO, and that the other region stays within its latency budget.
- Test a release that fails partway through the regions. Confirm the rollback path works.
- Run synthetic checks from each country where users are.

## How to implement it

1. Write the regional stack once, as code, with the region as a variable. Deploy the same artifact to every region.
2. Put a health-checked DNS record in front of each region, and a tenant-aware routing layer behind it.
3. Roll out in stages: a canary slice first, then the rest of that region, then the next region.
4. Write the failover runbook before you need it. Include the trigger, who approves, the database promotion steps, and the fail-back steps.
5. Run a game day regularly. Measure the actual RTO and RPO, and compare them with the targets.

### One module, instantiated per region (Terraform sketch, not run here)

```hcl
provider "aws" {
  alias  = "us"
  region = "us-east-1"
}

provider "aws" {
  alias  = "ca"
  region = "ca-central-1"
}

module "region_us" {
  source      = "./modules/region"
  providers   = { aws = aws.us }
  region_name = "us-east-1"
  app_image   = var.app_image      # the same image in every region
}

module "region_ca" {
  source      = "./modules/region"
  providers   = { aws = aws.ca }
  region_name = "ca-central-1"
  app_image   = var.app_image
}
```

### Staged rollout (Argo Rollouts; the YAML parses, not applied here)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: orders-api
spec:
  replicas: 6
  strategy:
    canary:
      steps:
        - setWeight: 10
        - pause: { duration: 15m }
        - setWeight: 50
        - pause: { duration: 15m }
        - setWeight: 100
```

This needs the Argo Rollouts controller in the cluster. Run it in one region, check the metrics, and only then roll the same change to the next region.

### Failover runbook (outline)

1. Confirm the failure from at least two places, so one probe's view does not decide it.
2. If the failed region's primary is still reachable, stop writes to it, to avoid split brain.
3. Promote the replica in the surviving region. Record the replication lag at that moment. That lag is the data at risk (the RPO).
4. Switch routing for the tenants homed in the failed region. Check residency first: a Canadian-homed tenant may not be allowed to fail over to a US region, so the answer may be to wait for the home region.
5. Watch the error rate and latency in the surviving region.
6. Fail back only after the original primary is healthy and has caught up. Plan how to reconcile any writes made during the failover.

## Common mistakes

- Building each region by hand, so the regions drift apart.
- Rebuilding the artifact for each region.
- Deploying every region at once, so one bad release is global.
- Failover that was only ever planned on paper.
- Forgetting that backups, logs and monitoring carry the same residency obligations as the data.
- Calling a system "multi-region" without a failure plan for the database.

## Key takeaways

- Pick a topology per tenant tier: DR for single-country customers, active-active by tenant for regional ones.
- Each region is an independent stack, built from one reusable definition.
- Route by tenant home region, and accept latency as the price of residency.
- Build once, deploy in stages across regions, and keep rollback ready.
- Define RTO and RPO, and test the failover.

Related: [Multi-Region Database Design](/DB/Multi-Region-Database-Design), [Multi-Tenant Database Design](/DB/Multi-Tenant-Database-Design), [Fault Tolerance](/DB/Fault-Tolerance), [AWS: Load Balancing, DNS and CDN](/AWS/Load-Balancing-DNS-and-CDN), [AWS: Infrastructure as Code](/AWS/Infrastructure-as-Code).
