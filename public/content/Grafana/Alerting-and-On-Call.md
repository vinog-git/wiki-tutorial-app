# Grafana: Alerting, Contact Points and On-Call

Dashboards show problems to someone who is looking. Alerts tell the right person when no one is looking. Grafana Alerting evaluates queries on a schedule, decides whether a condition has been true long enough to matter, and routes notifications to the people or tools that can act. This page covers the model, how to write an alert rule that does not cry wolf, and how to route it.

## The alerting model

```
Alert rule  ──evaluates query every N seconds──▶  alert instance (per series)
                                                        │
                                       Pending (condition true, waiting for "for")
                                                        │
                                       Firing ──▶ Notification policy (routing tree)
                                                        │
                                                 Contact point (Slack, PagerDuty, email, webhook)
```

| Term | Meaning |
|---|---|
| **Alert rule** | Query, condition, evaluation interval, pending period, labels, annotations |
| **Alert instance** | One result series from the rule that is in an alert state (for example, one per service) |
| **Pending period** (`for`) | How long the condition must stay true before the alert fires |
| **Contact point** | Where a notification goes: Slack, PagerDuty, email, Opsgenie, webhook, Teams |
| **Notification policy** | A routing tree that matches alert labels and sends them to contact points |
| **Mute timing** | Time windows when notifications are suppressed (for example, maintenance) |
| **Silence** | A temporary mute on specific alerts |

## Creating an alert rule

An example rule: the orders service's error ratio is above 2% for five minutes.

1. Alerting → Alert rules → **New alert rule**
2. Query (Prometheus):

```promql
sum by (service) (rate(http_server_requests_seconds_count{service="orders", status=~"5.."}[5m]))
/
sum by (service) (rate(http_server_requests_seconds_count{service="orders"}[5m]))
```

3. Expressions: add a **Reduce** (last value) and a **Threshold** (is above `0.02`)
4. Evaluation: group `orders-alerts`, every `1m`, pending period `5m`
5. Labels: `severity=page`, `team=payments`
6. Annotations: a summary, a description, and a link to the runbook

The rule now fires only when the error ratio stays above 2% for five minutes, and each service gets its own alert instance because the query keeps the `service` label.

### The same rule as code

Provisioned alert rules keep alerts in git:

```yaml
# provisioning/alerting/orders-rules.yml
apiVersion: 1
groups:
  - orgId: 1
    name: orders-alerts
    folder: Services
    interval: 1m
    rules:
      - uid: orders-error-ratio
        title: Orders error ratio above 2%
        condition: C
        for: 5m
        noDataState: NoData
        execErrState: Error
        labels:
          severity: page
          team: payments
        annotations:
          summary: "Orders error ratio is {{ $values.B }}"
          runbook_url: https://wiki.example.com/runbooks/orders-errors
        data:
          - refId: A
            relativeTimeRange: { from: 300, to: 0 }
            datasourceUid: prometheus
            model:
              expr: sum by (service) (rate(http_server_requests_seconds_count{service="orders", status=~"5.."}[5m])) / sum by (service) (rate(http_server_requests_seconds_count{service="orders"}[5m]))
              refId: A
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              expression: A
              conditions:
                - evaluator: { type: gt, params: [0.02] }
              refId: C
```

Check the file and reload:

```bash
docker compose restart grafana
curl -s -u admin:$GRAFANA_PASSWORD localhost:3000/api/v1/provisioning/alert-rules \
  | python3 -c "import sys,json; [print(r['title'], r['for']) for r in json.load(sys.stdin)]"
```

```output
Orders error ratio above 2% 5m
```

## Avoiding noisy alerts

Most alert fatigue comes from a small set of mistakes:

| Mistake | Better |
|---|---|
| Alerting on a single bad sample | Use a `for` period of at least a few minutes |
| Alerting on a raw count that grows with traffic | Alert on a ratio or rate |
| Alerting on CPU at 80% | Alert on user impact: error ratio or latency SLO burn |
| Alerting on "no data" as an error | Set `noDataState` deliberately (`OK` or `NoData` for quiet services) |
| Every instance pages | Group alerts and page on the service, not each pod |
| No runbook | Every page-severity alert links to a runbook with a first step |

### SLO-based alerting: burn rate

Instead of alerting on thresholds, alert on how fast the error budget is being used. A fast burn wakes someone; a slow burn creates a ticket.

Assume a 99.9% availability SLO, which allows 0.1% errors:

```promql
# Fast burn: consuming the 30-day budget 14x too fast over 1 hour and 5 minutes
(
  sum(rate(http_server_requests_seconds_count{service="orders", status=~"5.."}[1h]))
  / sum(rate(http_server_requests_seconds_count{service="orders"}[1h]))
) > (14.4 * 0.001)
and
(
  sum(rate(http_server_requests_seconds_count{service="orders", status=~"5.."}[5m]))
  / sum(rate(http_server_requests_seconds_count{service="orders"}[5m]))
) > (14.4 * 0.001)
```

The two windows protect against brief spikes (the 5-minute window must also be high) and against slow recovery (the 1-hour window must be high). This is the multi-window, multi-burn-rate method from the Google SRE workbook.

## Contact points

Set up contact points under Alerting → Contact points. Example: Slack for warnings and PagerDuty for pages.

```yaml
# provisioning/alerting/contact-points.yml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: payments-slack
    receivers:
      - uid: slack-payments
        type: slack
        settings:
          url: https://hooks.slack.com/services/T000/B000/XXXX    # store in a secret, not in git
          title: "{{ template \"default.title\" . }}"
          text: "{{ template \"default.message\" . }}"

  - orgId: 1
    name: payments-pagerduty
    receivers:
      - uid: pd-payments
        type: pagerduty
        settings:
          integrationKey: $PAGERDUTY_KEY                           # from an environment variable
          severity: critical
```

Secrets such as webhook URLs and integration keys should come from environment variables or a secret manager. Grafana's provisioning supports `$ENV_VAR` substitution for this.

## Notification policies: routing

The routing tree matches alert labels and decides where each notification goes, how often it repeats, and how alerts are grouped:

```yaml
# provisioning/alerting/policies.yml
apiVersion: 1
policies:
  - orgId: 1
    receiver: default-email
    group_by: [alertname, service]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - receiver: payments-pagerduty
        object_matchers:
          - [severity, =, page]
          - [team, =, payments]
        group_wait: 10s
        repeat_interval: 1h
        continue: false

      - receiver: payments-slack
        object_matchers:
          - [team, =, payments]
          - [severity, =~, warning|info]
```

| Setting | Effect |
|---|---|
| `group_by` | Alerts sharing these labels are sent as one notification |
| `group_wait` | Wait before the first notification, to collect related alerts |
| `group_interval` | Wait before sending new alerts in an existing group |
| `repeat_interval` | How often to resend a still-firing alert |
| `continue` | Keep matching later routes after this one matches |

## Silences and mute timings

- **Silence** an alert temporarily during an incident you are already handling, with a comment and an expiry.
- **Mute timing** suppresses notifications on a schedule, for example during a planned maintenance window or outside business hours for non-critical alerts.

```bash
curl -s -X POST localhost:3000/api/alertmanager/grafana/api/v2/silences \
  -H "Authorization: Bearer $GRAFANA_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "matchers": [{ "name": "service", "value": "orders", "isEqual": true, "isRegex": false }],
    "startsAt": "2026-10-27T09:00:00Z",
    "endsAt": "2026-10-27T11:00:00Z",
    "createdBy": "oncall",
    "comment": "Planned database failover, INC-1234"
  }'
```

Always set an expiry on silences. A silence without one becomes a permanent blind spot.

## Testing alerts

- **Preview** a rule in the editor to see which series would fire right now.
- **Test contact points** to verify delivery before relying on them.
- **Simulate a failure** in staging: raise the error rate with a load test or a fault injection, and check the page arrives within the expected time.
- **Review history**: the alert state history shows every transition, which helps tune `for` periods after an incident.

## On-call practice

| Practice | Why |
|---|---|
| One owner per alert, named in the labels | Someone is accountable for every page |
| Every page links to a runbook with a first step | Night-time responders need a starting point |
| Review pages weekly; delete or tune the ones that never need action | Keeps the signal useful |
| Measure pages per on-call shift | Burnout is a reliability risk |
| Post-incident review for every page-severity incident | Turns incidents into fewer future pages |

## Non-Functional Requirements and Disaster Recovery

A 5-minute recovery leaves no time for a person to notice, diagnose and act. Alerting has two jobs here: detect a hard outage within about a minute, and start the automated recovery without waiting for someone to acknowledge a page.

### Non-functional requirements

| Requirement | Target | How to meet it |
|---|---|---|
| Detect a hard outage | Under 1 minute | Synthetic probes every 10 seconds from more than one location; alert rule evaluated every 10 seconds with `for: 30s` |
| Page the on-call person | Within a minute of the alert firing | Short notification group wait (the default is 30 seconds); an escalation policy in PagerDuty or Opsgenie |
| Automated recovery | Starts without a human | Health-check-driven failover at the load balancer, DNS or database, triggered by the probe rather than the page |
| Human decisions | Only data-loss choices | The runbook names each decision and the person who makes it |

### Burn-rate alerts are too slow for a hard outage

The burn-rate rule earlier on this page looks at a 1-hour and a 5-minute window. It protects the error budget well, but it reacts over minutes. Use a synthetic probe to catch a full outage quickly, and keep burn-rate alerts for slow degradation.

### Disaster declaration

Disaster management is partly process. Write these down before you need them:

- **Who declares** a regional failover, by role, and how: one button, one command, or one approval.
- **When it is declared.** For example: if automated recovery has not restored the service within 5 minutes, the incident lead declares a disaster and starts the manual runbook.
- **Who communicates** with customers, and how often. Name the person who updates the status page.
- **What gets measured.** After the incident, record the real time of each step and compare it with the budget.

## Key takeaways

- For a 5-minute target, detect outages with short-interval probes. Burn-rate alerts are for slow degradation.
- Alert rules evaluate queries; the `for` period stops single bad samples from paging.
- Alert on user impact and SLO burn rate, not on resource thresholds alone.
- Contact points deliver; notification policies route by labels and group related alerts.
- Keep rules and routing in version control, keep secrets out of git, and always set silence expiries.
