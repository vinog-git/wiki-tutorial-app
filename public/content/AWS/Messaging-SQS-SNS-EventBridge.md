# AWS: Messaging and Events (SQS, SNS, EventBridge)

Decoupling services with messages lets one service fail or slow down without taking the others with it. AWS has three main services, and interviews usually ask when to use which.

| Service | Pattern | Think of it as |
|---|---|---|
| **SQS** | Queue: one consumer group takes each message | A to-do list for workers |
| **SNS** | Pub/sub: one message fans out to many subscribers | A broadcast or mailing list |
| **EventBridge** | Event bus: route events by content to targets | A smart router with rules |

Common combination: SNS topic fans out to several SQS queues, each feeding a different service. EventBridge carries AWS service events and business events with pattern matching.

## SQS

### Standard vs FIFO

| | Standard | FIFO |
|---|---|---|
| Ordering | Best effort | Strict within a message group |
| Delivery | At least once; occasional duplicates | Exactly-once processing (deduplication window) |
| Throughput | Nearly unlimited | Lower by default (high-throughput mode available) |
| Name | any | must end in `.fifo` |

### Visibility timeout and polling

When a consumer receives a message, the message is hidden for the **visibility timeout**. If the consumer deletes it in time, it is gone. If not, it reappears for another consumer. Set the timeout longer than your worst-case processing time.

Use **long polling** (`WaitTimeSeconds` up to 20) to avoid paying for empty receives.

### Create a queue with a dead-letter queue

A dead-letter queue (DLQ) holds messages that failed too many times, so one poison message does not block the rest.

```bash
aws sqs create-queue --queue-name orders-dlq
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url \
  $(aws sqs get-queue-url --queue-name orders-dlq --query QueueUrl --output text) \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

aws sqs create-queue --queue-name orders-queue --attributes "{
  \"VisibilityTimeout\": \"60\",
  \"ReceiveMessageWaitTimeSeconds\": \"20\",
  \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"
}"
```

After five failed receives the message moves to `orders-dlq`. Set an alarm on the DLQ depth so you know when it fills.

### Consumer code

```python
import json
import boto3

sqs = boto3.client("sqs", region_name="us-east-1")
QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue"

def process(body: dict) -> None:
    print("processing order", body["orderId"])

while True:
    resp = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=10,
        WaitTimeSeconds=20,          # long polling
    )
    for msg in resp.get("Messages", []):
        try:
            process(json.loads(msg["Body"]))
        except Exception:
            continue                 # leave it; it becomes visible again and eventually goes to the DLQ
        sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=msg["ReceiptHandle"])
```

```output
processing order o-1001
processing order o-1002
```

Make consumers **idempotent**. Standard queues can deliver a message twice, so processing the same order twice must not charge the card twice.

### Lambda as a consumer

Lambda polls the queue for you and deletes successful messages. Set `ReportBatchItemFailures` so only the failed items retry:

```bash
aws lambda create-event-source-mapping \
  --function-name process-orders \
  --event-source-arn arn:aws:sqs:us-east-1:123456789012:orders-queue \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures
```

## SNS

SNS sends a message to every subscriber of a topic: SQS queues, Lambda functions, HTTP endpoints, email, SMS, or mobile push.

```bash
aws sns create-topic --name order-events
TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:order-events

# Fan out to two SQS queues
aws sns subscribe --topic-arn $TOPIC_ARN --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789012:billing-queue
aws sns subscribe --topic-arn $TOPIC_ARN --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789012:shipping-queue
```

Publish an event:

```bash
aws sns publish --topic-arn $TOPIC_ARN \
  --message '{"orderId":"o-1001","total":129}' \
  --message-attributes '{"eventType":{"DataType":"String","StringValue":"OrderPlaced"}}'
```

### Filter policies

Subscribers receive only the messages they care about, based on attributes:

```json
{
  "eventType": ["OrderPlaced", "OrderCancelled"],
  "total": [{ "numeric": [">=", 100] }]
}
```

Apply it to a subscription with `aws sns set-subscription-attributes --attribute-name FilterPolicy`.

**The pattern SNS + SQS** gives each consumer its own queue and retry behaviour. The SQS queue policy must allow the SNS topic to send to it.

## EventBridge

EventBridge is an event bus. Producers publish JSON events; rules match patterns and send matching events to targets. It receives events from AWS services (EC2 state changes, CodePipeline, S3 object created), from SaaS partners, and from your own apps.

```bash
aws events put-rule --name order-placed \
  --event-pattern '{
    "source": ["orders.service"],
    "detail-type": ["OrderPlaced"],
    "detail": { "total": [{ "numeric": [">=", 100] }] }
  }'

aws events put-targets --rule order-placed \
  --targets "Id=1,Arn=arn:aws:lambda:us-east-1:123456789012:function:high-value-alert"

aws events put-events --entries '[{
  "Source": "orders.service",
  "DetailType": "OrderPlaced",
  "Detail": "{\"orderId\":\"o-1001\",\"total\":129}"
}]'
```

```output
{ "FailedEntryCount": 0, "Entries": [ { "EventId": "3f2a1b9c-..." } ] }
```

### Scheduled rules

EventBridge also replaces cron jobs:

```bash
aws events put-rule --name nightly-report \
  --schedule-expression "cron(0 2 * * ? *)"
```

### SNS vs SQS vs EventBridge

| Question | Answer points to |
|---|---|
| Do I need messages processed by a worker pool with retries? | SQS |
| Do several services need the same message, now? | SNS (often SNS + SQS) |
| Do I route by event content or schema, or integrate SaaS? | EventBridge |
| Do I need replay of past events? | EventBridge Archive and Replay, or Kinesis |
| Do I need strict ordering? | SQS FIFO or Kinesis (ordered per shard) |
| Do I need high-volume streaming analytics? | Kinesis Data Streams or MSK (Kafka) |

## Delivery guarantees to remember

- SQS Standard and SNS: at-least-once. Design consumers to be idempotent.
- SQS FIFO: exactly-once processing within a deduplication window.
- Poison messages go to the DLQ after `maxReceiveCount` attempts.
- Lambda retries asynchronous invocations twice by default, then sends to a DLQ or on-failure destination.

## Key takeaways

- SQS for work queues, SNS for fan-out, EventBridge for content-based routing and schedules.
- Consumers must be idempotent; duplicates are normal in standard queues.
- Always configure a dead-letter queue and alarm on its depth.
- Set the visibility timeout longer than processing time, and use long polling.
- SNS to SQS fan-out gives each consumer independent retries.
