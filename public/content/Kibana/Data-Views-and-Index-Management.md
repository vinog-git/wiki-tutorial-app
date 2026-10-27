# Kibana: Data Views, Mappings and Index Management

Before Kibana can show anything, it needs a **data view** (called an index pattern in older versions). A data view points at one or more indices, names a time field, and exposes their fields for search and visualisation. Getting data views and mappings right is the difference between a clean log search and a confusing one.

## Create a data view

1. Stack Management → **Data Views** → Create data view
2. Name: `Orders logs`
3. Index pattern: `logs-orders-*` (matches every daily index)
4. Timestamp field: `@timestamp`
5. Save

Or create it through the Kibana API, which is useful in automation:

```bash
curl -s -X POST localhost:5601/api/data_views/data_view \
  -H "kbn-xsrf: true" -H "Content-Type: application/json" \
  -d '{
    "data_view": {
      "title": "logs-orders-*",
      "name": "Orders logs",
      "timeFieldName": "@timestamp"
    }
  }'
```

```output
{ "data_view": { "id": "3a7f...", "title": "logs-orders-*", "timeFieldName": "@timestamp", ... } }
```

A data view with a wildcard (`logs-orders-*`) covers every daily index automatically, so new days appear without changes.

## Field types and why they matter

Kibana reads the mapping from Elasticsearch. The type decides which operations are possible:

| Field type | Filterable | Aggregatable | Full-text search | Typical example |
|---|---|---|---|---|
| `keyword` | Yes | Yes | No (exact only) | `service`, `level`, `orderId` |
| `text` | Limited | No (unless a `.keyword` sub-field exists) | Yes | `message` |
| `long`, `integer`, `float` | Range queries | Yes | No | `latencyMs`, `statusCode` |
| `date` | Range queries | Yes (histograms) | No | `@timestamp` |
| `boolean` | Yes | Yes | No | `retryable` |
| `ip` | Yes (CIDR) | Yes | No | `clientIp` |
| `object` / `nested` | Via dot notation | Nested needs special queries | Depends | `error.stack` |

A `text` field with a `keyword` sub-field gives both search and aggregation:

```json
{
  "mappings": {
    "properties": {
      "message": {
        "type": "text",
        "fields": { "raw": { "type": "keyword", "ignore_above": 512 } }
      }
    }
  }
}
```

In Kibana, aggregate on `message.raw` to see the most common messages.

## Index templates: consistent mappings

An index template applies settings and mappings to any new index whose name matches a pattern. Without one, Elasticsearch guesses the types from the first document (dynamic mapping), which is often wrong for `orderId` or `latencyMs`.

```
PUT _index_template/logs-orders
{
  "index_patterns": ["logs-orders-*"],
  "data_stream": {},
  "template": {
    "settings": { "number_of_shards": 1, "number_of_replicas": 1 },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp": { "type": "date" },
        "level":      { "type": "keyword" },
        "service":    { "type": "keyword" },
        "env":        { "type": "keyword" },
        "version":    { "type": "keyword" },
        "traceId":    { "type": "keyword" },
        "orderId":    { "type": "keyword" },
        "latencyMs":  { "type": "integer" },
        "message":    { "type": "text" }
      }
    }
  }
}
```

`"dynamic": "strict"` rejects documents with unknown fields, which catches typos in log field names early. Use `"dynamic": "true"` while the schema is still changing.

## Data streams

For time-series logs, use a **data stream** instead of hand-named daily indices. Writes go to the stream, and Elasticsearch creates backing indices and rolls them over automatically.

```
POST logs-orders-prod/_doc
{
  "@timestamp": "2026-10-27T09:14:02Z",
  "level": "INFO",
  "service": "orders",
  "message": "order placed",
  "orderId": "o-1001"
}
```

Filebeat and the Elastic Agent write to data streams by default, using the naming pattern `<type>-<dataset>-<namespace>` (for example `logs-orders-prod`).

## Index Lifecycle Management (ILM)

ILM moves indices through phases and deletes them when they are no longer needed. Logs grow fast; without ILM, disks fill silently.

| Phase | Typical action |
|---|---|
| **Hot** | Actively written; fast storage; rollover at size or age |
| **Warm** | Read-mostly; fewer replicas; force merge |
| **Cold** | Rarely searched; cheaper storage (searchable snapshots) |
| **Delete** | Remove after retention ends |

```
PUT _ilm/policy/logs-14d
{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_age": "1d", "max_primary_shard_size": "20gb" } } },
      "warm":   { "min_age": "3d", "actions": { "forcemerge": { "max_num_segments": 1 } } },
      "delete": { "min_age": "14d", "actions": { "delete": {} } }
    }
  }
}
```

Attach the policy in the index template's settings with `"index.lifecycle.name": "logs-14d"`.

## Check index health and size

```
GET _cat/indices/logs-*?v&s=index&h=index,health,docs.count,store.size
GET _cat/shards/logs-orders-*?v
GET _data_stream/logs-orders-prod
```

```output
index                          health docs.count store.size
logs-orders-prod-2026.10.26      green    482330     212.4mb
logs-orders-prod-2026.10.27      green    131907      58.1mb
```

## Runtime fields

A runtime field computes a value at query time without changing the stored data. Use it for a quick fix, such as extracting a field you did not index:

```
GET logs-orders-*/_search
{
  "runtime_mappings": {
    "latency_seconds": {
      "type": "double",
      "script": { "source": "emit(doc['latencyMs'].value / 1000.0)" }
    }
  },
  "fields": ["latency_seconds"],
  "size": 1
}
```

Runtime fields are slower than indexed fields. If you query one every day, index the field instead.

## Field formatting and scripted display

In Stack Management → Data Views → your view, you can:

- Hide noisy fields from the sidebar
- Set a popularity so common fields appear first
- Format a number as bytes, duration or percentage
- Create a runtime field or a scripted field for the UI

## Common problems

| Symptom | Cause | Fix |
|---|---|---|
| No data in Discover | Wrong time field, or time range set to the past | Check the time picker and `@timestamp` |
| Field shows as `text` and cannot be aggregated | Dynamic mapping chose `text` | Use `message.raw` or fix the template |
| `mapper_parsing_exception` | A document's value does not match the mapping (for example a string in an integer field) | Fix the shipper, or relax the field in the template |
| Data view shows fields from old indices with different types | Field type changed between indices | Reindex, or use a stable template |
| Disk fills up | No ILM policy | Add ILM and check `_cat/indices` sizes |

## Key takeaways

- A data view is how Kibana sees your indices; use a wildcard pattern and `@timestamp`.
- Index templates fix mappings before data arrives; use `keyword` for IDs and filters, `text` for messages.
- Use data streams and ILM for logs so rollover and deletion are automatic.
- Runtime fields help temporarily; index fields you query often.
