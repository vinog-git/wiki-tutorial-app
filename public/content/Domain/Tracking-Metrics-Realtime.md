# Domain: Tracking Metrics in Real Time

## Why real time

A metric reported once a month arrives too late to change anything. Real-time tracking means each event (a deploy, a merged PR, an incident opened) updates the number within seconds or minutes. The team sees a problem while it is still small.

The examples below follow one sample team, **Payments**, over one working week. The numbers are illustrative. The commands and queries are the parts to reuse.

## The pipeline

```
GitHub / Jira / PagerDuty  →  event collector  →  time-series store  →  dashboard + alerts
   (source events)           (webhooks or CI)     (Prometheus, etc.)     (Grafana)
```

Three rules keep the data trustworthy:

1. **Record each event once, at the source.** Do not reconstruct history from dashboards later.
2. **Store timestamps in UTC**, and keep the original event time, not the time it was received.
3. **Version the definitions.** When "failed deploy" changes meaning, record the change, so old and new numbers are not compared by mistake.

## Example 1: Deployment frequency and change failure rate

The Payments pipeline pushes a metric after every production deploy. A counter with labels is enough:

```
deploys_total{service="payments-api", env="prod", result="success"}  +1
deploys_total{service="payments-api", env="prod", result="failed"}   +1
```

A failed deploy is one followed by a rollback or a sev-1 or sev-2 incident within 24 hours. The pipeline marks it failed after that window closes.

Deployments per day over the last 7 days, in Prometheus:

```promql
sum(increase(deploys_total{env="prod", result="success"}[7d])) / 7
```

Change failure rate over the last 30 days:

```promql
sum(increase(deploys_total{env="prod", result="failed"}[30d]))
  /
sum(increase(deploys_total{env="prod"}[30d]))
```

Sample readout on Friday afternoon:

| Measure | Value | Status |
|---|---|---|
| Deploys per day (7-day average) | 2.4 | Up from 1.1 last month |
| Change failure rate (30 days) | 11% | Within the 15% guideline |
| Deploys since Monday | 12 | 2 failed, both rolled back |

The alert rule for a rising failure rate:

```yaml
- alert: PaymentsChangeFailureRateHigh
  expr: |
    sum(increase(deploys_total{env="prod", result="failed"}[30d]))
      /
    sum(increase(deploys_total{env="prod"}[30d])) > 0.15
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Payments change failure rate above 15% for 1 hour"
```

## Example 2: Lead time from pull request data

Lead time needs timestamps from the source code host. Pull the last 100 merged PRs with the GitHub CLI:

```bash
gh pr list --repo your-org/payments-api --state merged --limit 100 \
  --json createdAt,mergedAt \
  | jq -r '.[] | ((.mergedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) / 3600' \
  | sort -n \
  | awk '{ v[NR] = $1 } END { printf "median lead time: %.1f hours over %d PRs\n", v[int((NR+1)/2)], NR }'
```

This measures PR open to merge. Lead time to production is longer, because it adds the wait for deployment. To measure the full path, record `deploy_finished_at - first_commit_at` in the pipeline for each release.

Sample output: `median lead time: 18.5 hours over 100 PRs`.

## Example 3: Cycle time and WIP from Jira

Work in progress at this moment, from a Jira query:

```
project = PAY AND statusCategory = "In Progress" AND assignee in membersOf("payments-team")
```

Items finished in the last 7 days, for throughput:

```
project = PAY AND status changed to "Done" DURING (-7d, now())
```

Save each query as a filter, then add it as a gadget or a data source in your dashboard tool, so the numbers refresh without anyone copying them.

Sample readout on Friday:

| Measure | Value |
|---|---|
| WIP | 14 items across 6 people |
| Throughput this week | 9 items done |
| Little's Law check | 14 ÷ 9 ≈ 1.6 weeks average cycle time |

WIP of 14 for a team of six is more than the team limit of 2 per person (12). The dashboard flags it, and the team talks about what to pause.

## Example 4: Incident response from the alerting tool

Export incidents from PagerDuty or Opsgenie with `created_at`, `acknowledged_at`, and `resolved_at`. Compute:

- MTTA = average of `acknowledged_at - created_at`
- MTTR = median of `resolved_at - created_at`

Sample week: 3 incidents, MTTA 4 minutes, median MTTR 42 minutes. The longest incident, 2 hours 10 minutes, got a written review. Its action item was to add an alert for database connection pool exhaustion, which the team had seen in logs but never alerted on.

## Example 5: On-call load and team health

- **On-call load:** count pages per shift from the paging tool, grouped by time of day. Show the total for the team, never a per-person ranking.
- **Pulse survey:** run a 3-question form every second Friday. Show the share of agree responses only when at least 5 people answered, so no individual can be identified.
- **Overtime signal:** count commits and deploys outside 08:00 to 19:00 across the team, as one line on the dashboard.

## Building the dashboard

Put the numbers on one screen, grouped by the questions they answer:

1. **Are we shipping?** Deploys per day, lead time median.
2. **Are we safe?** Change failure rate, incident count, MTTR.
3. **Is work flowing?** WIP against limit, throughput, cycle time 85th percentile.
4. **Can the team sustain it?** On-call pages, pulse score, unplanned work share.

Review the dashboard in the weekly team meeting. Pick one number that moved most, and ask what caused it.

## Common pitfalls

- **Metrics that stop updating.** Add an alert when a data source has no new events for 24 hours. A flat line looks like good news.
- **Mixing environments.** Filter production and staging into separate series, or the frequency numbers inflate.
- **Manual corrections.** If someone edits a number by hand, record why. Otherwise the history cannot be trusted.
- **Too many panels.** Start with eight. Add a panel only when a decision depends on it.
