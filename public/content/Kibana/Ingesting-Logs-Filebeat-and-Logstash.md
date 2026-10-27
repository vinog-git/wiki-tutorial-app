# Kibana: Getting Logs In (Filebeat, Logstash and Ingest Pipelines)

Kibana only shows what Elasticsearch holds. This page covers the path from a running container or application to indexed, parsed documents: a shipper (Filebeat or Elastic Agent), optional transformation (Logstash or ingest pipelines), and index routing. The same parsing rules should be applied in one place, so you do not fix the logs differently in each service.

## Where parsing happens

| Option | Parses in | Use when |
|---|---|---|
| **Application emits JSON** | Nothing to parse | Best option; the app sets the fields |
| **Filebeat + JSON decode** | Shipper | Containers already write JSON to stdout |
| **Ingest pipeline** | Elasticsearch, at index time | Parsing shared across all shippers |
| **Logstash** | Dedicated pipeline service | Complex grok, enrichment from other systems, many input types |
| **Elastic Agent integrations** | Agent, with prebuilt parsers | Common sources such as Nginx, PostgreSQL, Docker, Kubernetes |

Prefer structured JSON from the application (see the Logging page). Parsing free-text logs with grok is fragile and expensive to maintain.

## Filebeat: container logs

Filebeat reads the Docker JSON log files, adds container metadata, decodes the application's JSON, and ships to Elasticsearch.

```yaml
# filebeat.yml
filebeat.inputs:
  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log
    stream: stdout                 # ignore stderr if your app writes errors to stdout

processors:
  - add_docker_metadata:           # container.name, container.image.name, container.id
      host: "unix:///var/run/docker.sock"
  - decode_json_fields:            # application's JSON becomes top-level fields
      fields: ["message"]
      target: ""
      overwrite_keys: true
      add_error_key: true
  - drop_fields:
      fields: ["log.offset", "agent"]

output.elasticsearch:
  hosts: ["http://elasticsearch:9200"]
  index: "logs-orders-%{+yyyy.MM.dd}"

setup.ilm.enabled: false           # ILM and templates are managed by Elasticsearch directly
setup.template.enabled: false
```

Run Filebeat as a container with the Docker socket and log directory mounted read-only:

```yaml
# docker-compose.yml excerpt
services:
  filebeat:
    image: docker.elastic.co/beats/filebeat:8.15.0
    user: root
    command: ["-e", "-strict.perms=false"]
    volumes:
      - ./filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      elasticsearch:
        condition: service_healthy
```

```bash
docker compose up -d filebeat
docker compose logs filebeat | tail -3
curl -s "localhost:9200/_cat/indices/logs-orders-*?v"
```

```output
health status index                        docs.count store.size
green  open   logs-orders-2026.10.27        1839       1.2mb
```

Mounting the Docker socket gives Filebeat read access to container metadata. Treat that as sensitive, and restrict who can run the stack.

## Filebeat: plain log files

For applications that write to a file, point an input at the file. Filebeat remembers its read position in a registry, so restarts do not duplicate lines.

```yaml
filebeat.inputs:
  - type: filestream
    id: orders-app-log
    paths:
      - /var/log/orders/*.log
    parsers:
      - ndjson:
          target: ""
          add_error_key: true
    fields:
      service: orders
      env: prod
    fields_under_root: true
```

## Logstash: grok, enrichment and routing

Logstash is a full pipeline with input, filter, and output stages. Use it when the parsing is complex or you enrich events from another source.

```conf
# logstash.conf
input {
  beats {
    port => 5044                       # Filebeat sends here
  }
}

filter {
  # Nginx access logs in the common combined format
  if [log][file][path] =~ /nginx/ {
    grok {
      match => { "message" => "%{COMBINEDAPACHELOG}" }
    }
    date {
      match => [ "timestamp", "dd/MMM/yyyy:HH:mm:ss Z" ]
      target => "@timestamp"
    }
    mutate {
      convert => { "response" => "integer" "bytes" => "integer" }
    }
  }

  # Enrich: map a customer tier from a lookup file
  translate {
    field => "[customerId]"
    destination => "[customerTier]"
    dictionary_path => "/usr/share/logstash/dictionaries/customer-tier.yml"
    fallback => "unknown"
  }

  # Remove sensitive fields before they are indexed
  mutate {
    remove_field => [ "[headers][authorization]", "[cardNumber]" ]
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    data_stream => true
    data_stream_type => "logs"
    data_stream_dataset => "nginx"
    data_stream_namespace => "prod"
  }
}
```

Test the configuration before reloading:

```bash
docker run --rm -v "$PWD/logstash.conf:/usr/share/logstash/pipeline/logstash.conf:ro" \
  docker.elastic.co/logstash/logstash:8.15.0 --config.test_and_exit
```

```output
Configuration OK
```

### Grok patterns

Grok turns text into named fields using patterns. Test them in Kibana's **Grok Debugger** (Dev Tools) before deploying.

```
%{TIMESTAMP_ISO8601:ts} %{LOGLEVEL:level} \[%{DATA:thread}\] %{DATA:logger} - %{GREEDYDATA:msg}
```

Grok is slow on large volumes and breaks when formats change. Use it for legacy formats; move applications to JSON when you can.

## Ingest pipelines: parse inside Elasticsearch

An ingest pipeline runs processors on each document as it is indexed. It works with any shipper and keeps parsing in one place.

```
PUT _ingest/pipeline/orders-normalise
{
  "description": "Normalise order log events",
  "processors": [
    { "rename": { "field": "lvl", "target_field": "level", "ignore_missing": true } },
    { "lowercase": { "field": "env", "ignore_missing": true } },
    { "convert": { "field": "latencyMs", "type": "integer", "ignore_missing": true } },
    { "date": { "field": "ts", "target_field": "@timestamp", "formats": ["ISO8601"], "ignore_failure": true } },
    { "remove": { "field": ["cardNumber", "password"], "ignore_missing": true } }
  ]
}
```

Attach it to the index template so every new index uses it:

```
PUT _index_template/logs-orders-pipeline
{
  "index_patterns": ["logs-orders-*"],
  "data_stream": {},
  "template": {
    "settings": { "index.default_pipeline": "orders-normalise" }
  }
}
```

Test a pipeline with sample data before relying on it:

```
POST _ingest/pipeline/orders-normalise/_simulate
{
  "docs": [
    { "_source": { "lvl": "ERROR", "env": "PROD", "latencyMs": "5012", "ts": "2026-10-27T09:14:02Z", "cardNumber": "4111..." } }
  ]
}
```

```output
{
  "docs": [ { "doc": { "_source": { "level": "ERROR", "env": "prod", "latencyMs": 5012, "@timestamp": "2026-10-27T09:14:02Z" } } } ]
}
```

## Elastic Agent and Fleet

Elastic Agent replaces separate shippers with one agent that runs integrations. Fleet in Kibana manages the agents and their policies centrally, so you change a configuration once instead of on every host.

| Approach | Good for |
|---|---|
| Standalone Filebeat | Simple setups, one or two hosts, full control of YAML |
| Elastic Agent with Fleet | Many hosts, prebuilt integrations, central policy |

## Keeping sensitive data out of the index

- Drop or hash fields in the application, the shipper or the pipeline. Remove fields such as `password`, `authorization`, and card numbers.
- Restrict who can read the indices with roles (next page).
- Set retention through ILM so personal data is deleted on schedule.

## Troubleshooting ingestion

| Symptom | Check |
|---|---|
| No new documents | Shipper logs (`docker compose logs filebeat`), Elasticsearch disk space, the index name in the output |
| Fields are strings instead of numbers | Mapping in the index template; add a `convert` processor |
| `mapper_parsing_exception` in logs | A value does not fit the mapping; fix the source or relax the field |
| Duplicate events after a restart | Filebeat registry was removed; check the `data` volume for the registry |
| Grok failures tagged `_grokparsefailure` | Pattern does not match the sample; test in the Grok Debugger |
| Logstash backs up | Output is slow; check Elasticsearch bulk rejections with `GET _nodes/stats/thread_pool` |

## Key takeaways

- Structured JSON from the application is the simplest and most reliable parsing.
- Filebeat ships container and file logs; Logstash handles complex parsing and enrichment.
- Ingest pipelines let Elasticsearch normalise and redact fields for every shipper.
- Redact sensitive fields before they are stored, and set retention with ILM.
