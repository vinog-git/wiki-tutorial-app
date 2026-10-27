# Kibana: Alerting, Security and Administration

A log platform is only useful if someone is told when it matters, and only safe if the right people can see the right data. This page covers Kibana alerting rules and connectors, the security model (users, roles, spaces, encryption), and the administration tasks that keep a cluster healthy.

## Alerting rules

A **rule** runs a check on a schedule and triggers an **action** when the condition is met. Rules live under Observability → Alerts (or Stack Management → Rules).

| Rule type | Triggers when |
|---|---|
| **Elasticsearch query** | A query returns more (or fewer) documents than a threshold |
| **Index threshold** | An aggregation on an index crosses a value, for example p95 latency above 800 ms |
| **Log threshold** | Matching log entries exceed a count in a window (Observability) |
| **Anomaly detection** | Machine-learning job flags unusual values |
| **Uptime / SLO burn rate** | Availability or error budget is being consumed too fast |

### Example: error spike in production

- Rule type: **Elasticsearch query**
- Index: `logs-orders-*`
- Query: `env : prod and level : ERROR`
- Condition: count is above 50 over the last 5 minutes
- Check every: 1 minute
- Action: post to the on-call Slack channel and create an incident in PagerDuty

The same rule can be created through the API, which is how teams keep alert definitions in version control:

```bash
curl -s -X POST localhost:5601/api/alerting/rule \
  -H "kbn-xsrf: true" -H "Content-Type: application/json" \
  -d '{
    "name": "orders: error spike in prod",
    "rule_type_id": ".es-query",
    "consumer": "alerts",
    "schedule": { "interval": "1m" },
    "tags": ["orders", "oncall"],
    "params": {
      "searchType": "esQuery",
      "index": ["logs-orders-*"],
      "timeField": "@timestamp",
      "timeWindowSize": 5,
      "timeWindowUnit": "m",
      "thresholdComparator": ">",
      "threshold": [50],
      "size": 0,
      "esQuery": "{ \"query\": { \"bool\": { \"filter\": [ { \"match\": { \"env\": \"prod\" } }, { \"match\": { \"level\": \"ERROR\" } } ] } } }"
    },
    "actions": []
  }'
```

```output
{ "id": "7c1e...", "name": "orders: error spike in prod", "enabled": true, ... }
```

Add actions through the UI or the API, after you create a connector.

### Connectors

Connectors are the outbound links that actions use: Slack, email, PagerDuty, webhooks, Jira, ServiceNow, and index writers.

| Connector | Typical use |
|---|---|
| **Email** | Digest or non-urgent notifications |
| **Slack** | Team channel notifications |
| **PagerDuty / Opsgenie** | Paging the on-call engineer |
| **Webhook** | Calling your own automation |
| **Index** | Writing alert documents to an index for later analysis |

Store connector secrets in Kibana's keystore, not in plain configuration. Reference them in the UI rather than pasting tokens into rule definitions.

### Alert quality

Noisy alerts get ignored. For each rule, decide:

| Question | Good answer |
|---|---|
| Who acts on it? | A named team, with a runbook link |
| What should they do? | A specific first step, documented |
| How often does it fire? | Rarely, and each firing matters |
| What is the threshold based on? | Historic data, not a guess |
| Does it auto-resolve? | Yes, when the condition clears |

Alert on symptoms users feel (error rate, latency SLO burn) rather than on every internal error. Use severity levels: page for user impact, notify for degraded but working, ticket for trends.

### Alert status and history

Observability → Alerts shows active and recovered alerts, and rule execution history shows each evaluation. Use the history to tune thresholds after an incident.

## Security model

### Authentication

| Mechanism | Use for |
|---|---|
| **Built-in users** | Initial setup only (`elastic`, `kibana_system`); rotate or disable |
| **Native realm** | Local users in Elasticsearch |
| **LDAP / Active Directory** | Corporate directories |
| **SAML / OIDC** | Single sign-on with an identity provider such as Okta or Azure AD |
| **API keys** | Services and scripts; scope them narrowly and expire them |

Enable security in any environment that is shared. The local stack in this section disables it for learning; never copy that to production.

### Authorization: roles

A **role** grants privileges on indices, Kibana features and spaces. Give people the smallest set they need.

```
PUT _security/role/orders_reader
{
  "cluster": [],
  "indices": [
    {
      "names": ["logs-orders-*"],
      "privileges": ["read", "view_index_metadata"],
      "field_security": {
        "grant": ["@timestamp", "level", "service", "message", "traceId", "orderId", "latencyMs"],
        "except": ["customerEmail"]
      }
    }
  ],
  "applications": [
    {
      "application": "kibana-.kibana",
      "privileges": ["feature_discover.all", "feature_dashboard.read"],
      "resources": ["space:orders"]
    }
  ]
}
```

This role reads order logs, cannot see the `customerEmail` field, and sees only the `orders` space.

```
POST _security/user/priya
{
  "password": "use-a-generated-password",
  "roles": ["orders_reader"],
  "full_name": "Priya Raman"
}
```

Field-level security (`except`) and document-level security (a query on the role) are how you keep personal data out of views that do not need it.

### Spaces

Spaces give each team its own dashboards, data views and saved searches. Combine spaces with roles: a space controls what is visible, and roles control what a user can change in it.

### Audit logging

Enable audit logs to record logins, role changes, and access to sensitive indices. Audit records are a common compliance requirement.

```yaml
# elasticsearch.yml
xpack.security.audit.enabled: true
xpack.security.audit.logfile.events.include: [authentication_failed, access_denied, access_granted]
```

### Transport and HTTP encryption

Production clusters use TLS between nodes and for HTTP clients. Kibana connects to Elasticsearch over HTTPS with a CA certificate:

```yaml
# kibana.yml
elasticsearch.hosts: ["https://elasticsearch:9200"]
elasticsearch.ssl.certificateAuthorities: ["/usr/share/kibana/config/certs/ca.crt"]
server.publicBaseUrl: "https://kibana.example.com"
```

Use the Elastic Stack certificate tool or your organisation's PKI to issue certificates. Rotate them before they expire.

## Administration tasks

| Task | Where | How often |
|---|---|---|
| Check cluster health (`green`, `yellow`, `red`) | Stack Monitoring, `GET _cluster/health` | Daily, alert on `red` |
| Watch disk and heap | Stack Monitoring | Daily; alert above 80% disk |
| Review ILM and retention | Index Lifecycle Policies | Monthly |
| Rotate passwords and API keys | Security | Quarterly, and on staff change |
| Review roles and users | Security → Users and Roles | Quarterly access review |
| Back up | Snapshots to a repository (S3 or filesystem) | Daily, test restore quarterly |
| Upgrade | Rolling upgrade, one node at a time | Per release; read the upgrade notes |

### Snapshots and restore

Snapshots back up indices to a repository. They are incremental and cheap to keep.

```
PUT _snapshot/s3-backups
{
  "type": "s3",
  "settings": { "bucket": "elastic-snapshots-123456789012", "base_path": "prod", "server_side_encryption": true }
}

PUT _snapshot/s3-backups/daily-2026-10-27?wait_for_completion=true
{
  "indices": "logs-orders-*",
  "include_global_state": false
}

GET _snapshot/s3-backups/daily-2026-10-27
```

```output
{ "snapshots": [ { "snapshot": "daily-2026-10-27", "state": "SUCCESS", "indices": [...] } ] }
```

Test a restore into a separate cluster, not over production data.

### Stack Monitoring

Stack Monitoring (in Kibana) shows node health, shard counts, indexing and search rate, heap, and disk for Elasticsearch, Kibana, Logstash and Beats. Enable the monitoring collection on the cluster so these views have data.

## Troubleshooting alerts

| Symptom | Cause | Fix |
|---|---|---|
| Rule never fires | Query returns nothing; time field wrong; index pattern does not match | Run the query in Discover with the same range |
| Rule fires constantly | Threshold below normal traffic | Raise the threshold; use a rate or ratio instead of a count |
| Action not delivered | Connector misconfigured or secret expired | Test the connector in its settings page; check rule execution history |
| Access denied on a dashboard | Role lacks the space or the index privilege | Check role, space and field-level security together |

## Key takeaways

- Rules check on a schedule and fire actions through connectors; keep rules few, specific and owned.
- Alert on user-visible symptoms and use severity levels.
- Security is roles plus spaces plus field-level security, with TLS and audit logging in production.
- Snapshot to S3, test restores, and watch cluster health and disk space.
