# Kibana: Discover, KQL and Searching Logs

**Discover** is where you read logs day to day. It shows matching documents over a time range, lets you filter and sort, and lets you open a single event to see every field. The query language inside Discover is **KQL** (Kibana Query Language). Learn KQL and you can answer most incident questions in seconds.

## Discover's layout

| Part | What it does |
|---|---|
| **Data view selector** (top left) | Choose which indices to search |
| **Time picker** (top right) | Restrict results to a window such as "Last 15 minutes" or an absolute range |
| **Query bar** | Type a KQL query and press Enter |
| **Filters** | Pill-shaped conditions added from a field or the query; can be negated, pinned or disabled |
| **Field list** (left) | Add fields as columns, see the top values |
| **Histogram** | Event counts over time; click and drag to zoom into a time window |
| **Document table** | Rows of matching events; expand one to see JSON or the table view |

## KQL basics

KQL matches field values with `field:value`. Without a field name it searches all text fields.

| Query | Meaning |
|---|---|
| `level : "ERROR"` | Exact match on a keyword field |
| `service : orders` | Same, without quotes when no spaces |
| `message : timeout` | Full-text match on a text field (tokenised) |
| `message : "payment gateway timeout"` | Phrase match (words in order) |
| `"connection refused"` | Phrase across all fields |
| `level : ERROR and service : orders` | Both conditions |
| `level : ERROR or level : WARN` | Either |
| `not level : INFO` | Exclude INFO |
| `latencyMs > 1000` | Range comparison on a numeric field |
| `orderId : o-100*` | Wildcard on a keyword field |
| `clientIp : 10.0.0.0/16` | CIDR match on an `ip` field |
| `tags : *` | Documents where the field exists |
| `(level : ERROR or level : WARN) and env : prod` | Grouping with parentheses |

Keep the query language in mind:

- `and`, `or`, `not` are case-insensitive keywords.
- Quote values that contain spaces or special characters.
- A keyword field matches the whole value; a text field matches individual words.

## Time-bounded investigations

Most incident work is "what happened between 09:10 and 09:20?". Set the absolute range, then narrow the query:

```
service : orders and level : ERROR and @timestamp >= "2026-10-27T09:10:00Z"
```

Kibana also lets you select a window in the histogram: drag across the bars, and the time picker updates.

## Pinned and negated filters

Use filters for conditions you keep applying. A filter pill can be:

- **Included** (default): documents must match
- **Excluded**: documents must not match
- **Pinned**: stays when you change the view or the query
- **Disabled**: kept, but not applied, so you can compare with and without it

Filters combine with the query bar with AND. Use filters for exact field values and the query bar for free text.

## Columns and sorting

Click a field in the sidebar and choose **Add** to show it as a column. Useful default columns for application logs:

```
@timestamp  level  service  env  traceId  orderId  message
```

Sort by `@timestamp` ascending to read in order, or descending for the latest first. Remove columns you do not need so each row stays readable.

## Following a request across services

If every log line carries a trace ID (see the Logging page in the Docker section), search for that one value:

```
traceId : "4bf92f3577b34da6a3ce929d0e0e4736"
```

Sort by `@timestamp`. You now see the request's path through the gateway, orders, payments and notifications services, in order, in one list. That is the main reason to add trace IDs to every log line.

## Field value statistics

In the field list, click a field to see its **top 5 values** for the current query. Use it to answer questions like "which services produce most errors?" without writing an aggregation. For more detail, use the **Visualize** button to open a chart in Lens with that field.

## Saved searches

Save a query you use often (for example `level : ERROR and env : prod`) as a **saved search**. Saved searches can be added to dashboards and shared with the team, and they keep the columns and sort you chose.

## Common KQL mistakes

| Mistake | Effect | Fix |
|---|---|---|
| `level = ERROR` | KQL does not use `=` for equality | Use `level : ERROR` |
| `message : timeout` expected to match "timeouts" | Text fields match tokens, so the word `timeouts` is different | Use a wildcard `message : timeout*` or the phrase |
| `service : Orders` returns nothing | Keyword fields are case-sensitive | Match the exact value, or lower-case at ingest |
| `latencyMs : >1000` | Wrong syntax for a range | Use `latencyMs > 1000` |
| Searching a text field with an ID | Tokenisation splits the ID | Use the keyword field (`orderId`) |
| Long time range with a broad query | Slow results | Narrow the time window first |

## Lucene syntax

KQL is the default. Discover can also use the older Lucene syntax, which supports regular expressions and fuzzy matching:

```
message : /time(out|r)/
message : timout~1
```

Switch with the query language selector next to the query bar.

## A practical incident query set

```
# All errors in production in the last hour
env : prod and level : ERROR

# Slow requests from the orders service
service : orders and latencyMs > 2000

# A customer's activity, across services
customerId : "c-42"

# Timeouts from any downstream dependency
message : "timed out" or message : timeout*

# Exclude health checks from noise
not message : "GET /actuator/health"
```

## Key takeaways

- Use `field : value` in KQL; `and`, `or`, `not`, and ranges with `>` and `<`.
- Set the time range first, then narrow with the query.
- Filters for exact values, the query bar for text; pin filters you reuse.
- Trace IDs in every log line let you follow one request across services.
- Save common queries as saved searches and share them.
