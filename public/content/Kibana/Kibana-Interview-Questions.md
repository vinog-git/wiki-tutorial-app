# Kibana and Elasticsearch Interview Questions

Short answers first, with the page that has the depth.

## Foundations

**1. What is the difference between Elasticsearch and Kibana?**
Elasticsearch stores, indexes and searches documents through a REST API. Kibana is the UI on top: Discover, dashboards, visualisations, alerts and administration. *(See Overview.)*

**2. What is an index, a document and a mapping?**
An index is a collection of documents with similar structure. A document is a JSON object. The mapping defines each field's name and type, which controls how it is searched and aggregated. *(See Overview.)*

**3. What is an inverted index?**
A structure that maps each term to the list of documents containing it. It makes full-text search fast because a query looks up terms instead of scanning every document. *(See Overview.)*

**4. What are shards and replicas?**
A shard is a slice of an index stored as a Lucene index on one node. Replicas are copies of a primary shard, used for resilience and to serve reads. *(See Overview.)*

**5. What do green, yellow and red mean?**
Green: all primary and replica shards are allocated. Yellow: all primaries are allocated, but some replicas are not. Red: some primary shards are not allocated, so data is missing from searches. *(See Overview.)*

**6. `keyword` vs `text`?**
`keyword` stores exact values for filters, sorting and aggregations (IDs, levels, statuses). `text` is analysed for full-text search (messages, descriptions) and cannot be aggregated directly. *(See Data Views.)*

**7. What is dynamic mapping and why is it risky?**
Elasticsearch guesses field types from the first document. A value like an order ID can be guessed as `text` or `long`, which breaks later searches. Use index templates with explicit mappings, and `dynamic: strict` to catch unexpected fields. *(See Data Views.)*

## Data management

**8. What is a data view?**
A Kibana object that points at one or more indices, names the time field, and exposes fields for Discover and visualisations. *(See Data Views.)*

**9. What is a data stream?**
An append-only abstraction for time-series data. Writes go to the stream; Elasticsearch creates and rolls over backing indices automatically. *(See Data Views.)*

**10. What is ILM?**
Index Lifecycle Management moves indices through hot, warm, cold and delete phases based on age or size, controlling storage cost and retention. *(See Data Views.)*

**11. What is a runtime field?**
A field computed at query time from a script, without changing stored data. It is flexible but slower than indexed fields. *(See Data Views.)*

## Ingestion

**12. Filebeat vs Logstash?**
Filebeat is a lightweight shipper that reads files or container logs and forwards them. Logstash is a heavier pipeline with grok parsing, enrichment and routing. A common chain is Filebeat to Logstash to Elasticsearch, or Filebeat straight to Elasticsearch with ingest pipelines. *(See Ingesting Logs.)*

**13. What is an ingest pipeline?**
Processors that run inside Elasticsearch on each document before indexing, such as rename, convert, date parsing and field removal. It keeps parsing consistent across shippers. *(See Ingesting Logs.)*

**14. How do you handle sensitive data in logs?**
Do not log it in the first place. Otherwise remove or hash fields at the source, in the shipper or in an ingest pipeline, restrict access with roles and field-level security, and set retention with ILM. *(See Ingesting Logs and Security.)*

**15. Why should applications log JSON rather than plain text?**
Each field is parsed at source with no grok, so queries are exact, fields are typed and aggregations work. Free text needs fragile patterns that break when the format changes. *(See Ingesting Logs.)*

## Searching and dashboards

**16. What is KQL?**
Kibana Query Language. It matches fields with `field : value`, supports `and`, `or`, `not`, ranges and wildcards. Lucene syntax is also available for regular expressions and fuzzy matching. *(See Discover.)*

**17. How do you follow one request across services?**
Include a trace ID in every log line, then filter on that value in Discover and sort by timestamp. *(See Discover.)*

**18. Why use percentiles for latency?**
Averages hide slow outliers. p95 and p99 show the experience of the slowest users, which is what SLOs measure. *(See Dashboards.)*

**19. What is the difference between a filter and a query in Discover?**
A filter is an exact condition shown as a pill that can be pinned, negated or disabled. A query is a KQL expression typed in the query bar. Both combine with AND. *(See Discover.)*

**20. How do you build an error-rate panel?**
A Lens formula: count of documents matching the error condition divided by the total count, times 100, optionally broken down by service. *(See Dashboards.)*

## Alerting and security

**21. How do Kibana alerts work?**
A rule runs a check on a schedule (for example an Elasticsearch query or an index threshold). When the condition is met it triggers actions through connectors to Slack, email, PagerDuty or webhooks. *(See Alerting.)*

**22. How do you avoid alert fatigue?**
Alert on user-visible symptoms, set thresholds from historical data, use rates or ratios rather than raw counts, give each rule an owner and a runbook, and tune or remove rules that fire without action. *(See Alerting.)*

**23. How do you restrict what a user sees in Kibana?**
Roles define index and field privileges (field-level security can exclude fields), feature privileges, and space access. Document-level security can filter rows. *(See Alerting and Security.)*

**24. What do spaces do?**
They separate saved objects such as dashboards and data views for teams or environments. Spaces control visibility; roles control what can be changed. *(See Dashboards and Security.)*

## Operations

**25. How do you back up Elasticsearch?**
Register a snapshot repository (for example S3), take snapshots of the indices, and test restores in a separate cluster. Snapshots are incremental. *(See Security and Administration.)*

**26. A cluster has disk at 90% and writes are being rejected. What do you do?**
Free space by deleting or moving old indices through ILM, add disk or nodes, and check that replicas are not oversized. Elasticsearch blocks writes at the flood-stage watermark, so act early. *(See Administration.)*

**27. How do you size shards?**
Aim for shard sizes of tens of gigabytes, not thousands of tiny shards. Too many shards waste heap and slow cluster state updates. Use ILM rollover to size by size or age. *(See Data Views.)*

**28. How would you secure a production cluster?**
Enable security and TLS for transport and HTTP, use SSO for people and API keys for services, apply least-privilege roles with field and document security, enable audit logs, restrict network access, and keep snapshots in an encrypted bucket. *(See Security.)*

## Scenario questions

**29. Design a logging pipeline for 30 microservices on Docker hosts.**
Services write structured JSON to stdout with trace IDs. Filebeat or Fluent Bit on each host ships container logs to Elasticsearch data streams named per service and environment. Ingest pipelines normalise fields and redact secrets. ILM keeps 14 days hot and warm and deletes after 30 days. Kibana has shared dashboards per team in spaces, roles restrict personal fields, and alert rules page on error-rate SLO burn.

**30. Error logs spike but dashboards look fine. How do you investigate?**
Check the data view time field and time range, confirm the shipper is still sending (indices growing, no `_grokparsefailure`), compare the spike with a deployment time, filter Discover by version and service, and look at the top error messages. Check whether a field mapping change caused documents to be rejected.

**31. Searches for an order ID return nothing, but the ID is in the log. Why?**
The field is probably mapped as `text`, so the ID is tokenised and the match behaves differently, or it is a `keyword` with different casing or a trailing space. Check the mapping with `GET <index>/_mapping`, and fix it in the index template for future indices.

## Quick-fire

- **Refresh interval?** How often new documents become searchable; default one second.
- **Bulk API?** Sends many index operations in one request; use it for shippers.
- **Searchable snapshot?** An index whose data stays in a snapshot repository and is read on demand, for cheap cold storage.
- **Rollover?** Starting a new backing index when the current one reaches a size or age.
- **Reindex?** Copies documents from one index into another, for example to change a mapping.
- **`_cat` APIs?** Human-readable summaries such as `_cat/indices` and `_cat/shards`.
- **Heap rule of thumb?** No more than half of RAM, and under about 31 GB so compressed object pointers stay enabled.
