# DB: Saga Pattern

A **saga** is a way to run one business operation that spans several services or databases, without a single ACID transaction across them. The operation becomes a sequence of local transactions. Each one commits in its own database. If a later step fails, the steps that already committed are undone by **compensating transactions**, which are new business actions that reverse their effect.

## The problem

An order touches three systems: the order database, the inventory service and the payment provider. A single `BEGIN ... COMMIT` cannot cover all three. Two options come up:

- **Two-phase commit (2PC)** coordinates a transaction across databases. It blocks while waiting for the coordinator, locks resources for the whole round trip, and many services and SaaS APIs do not support it at all.
- **Separate local transactions with no plan** leave the system half-done after a failure. Inventory is reserved, but the card is never charged, and nothing puts the stock back.

A saga is the design that keeps the first option out of the picture and handles the second.

## How it works

Take the steps `T1, T2, T3`, each with a compensation `C1, C2, C3`:

- If all three succeed, the saga is complete.
- If `T2` fails, the saga runs `C1`. Nothing else has committed yet beyond `T1`.
- If `T3` fails, the saga runs `C2`, then `C1`, in reverse order.

Each step is a local ACID transaction in one service. The saga is the sequence and the compensation rules that tie them together.

## Compensation is not rollback

A database rollback undoes uncommitted changes. A compensation is a new, committed action that reverses a business effect, and the two differ in important ways:

| Step | Compensation | Notes |
|---|---|---|
| Create order as `PENDING` | Mark order `CANCELLED` | The row is kept as a record. It is not deleted. |
| Reserve inventory | Release the reservation | Stock returns to available. |
| Charge the card | Refund the charge | A refund is a new transaction. It can take days to appear on a statement. |
| Send confirmation email | None | Email cannot be unsent. Make it the last step, or send it from outside the saga. |

Some effects cannot be compensated at all. Once a parcel is handed to the courier, nothing undoes that.

## The pivot transaction

Design each saga around a **pivot**, the step after which the saga always moves forward.

- Steps **before** the pivot are **compensatable**. If they fail, the saga backs out.
- The pivot itself either commits or the saga backs out.
- Steps **after** the pivot must be **retriable**. They are retried until they succeed, because there is nothing left to undo.

For an order, scheduling the shipment is a sensible pivot. Reservation and payment come before it and can be undone. Confirmation and notification come after it and are retried until done.

## Isolation: the price of a saga

A saga does not have isolation. Once `T1` commits, other transactions can see the `PENDING` order and the reserved stock before the saga finishes. This is a business-level dirty read, and it can produce wrong decisions if you ignore it. Common countermeasures:

- **Semantic lock**: record the in-progress state in the data itself. An order in `PENDING` is not shippable, and other operations must check the state before acting.
- **Commutative updates**: design operations so their order does not matter, such as adding and subtracting stock rather than setting it.
- **Versioning**: reject a later update when the record has changed since it was read. This is the same version-column idea as in [Isolation Levels and Anomalies](/DB/Isolation-Levels-and-Anomalies).
- **Reread before acting**: check the current state again before a compensation or a commit, rather than trusting the state you read earlier.

## Two coordination styles

### Choreography

Each service listens for events and reacts to them. There is no central controller.

```
OrderCreated        -> Inventory reserves stock
InventoryReserved   -> Payment charges the card
PaymentCharged      -> Shipping schedules the parcel (pivot)
PaymentFailed       -> Inventory releases the reservation, Order is cancelled
```

- Pros: no single component to maintain, and services stay loosely coupled.
- Cons: the flow is spread across many services, so it is hard to see and to debug. Adding a step means changing several services.
- Use it for short sagas with few participants.

### Orchestration

One orchestrator owns the saga. It sends commands to each participant, waits for replies, and decides the next step or the compensation.

```
Orchestrator --ReserveStock-->   Inventory   --StockReserved-->
Orchestrator --ChargeCard-->     Payment     --CardCharged-->
Orchestrator --ScheduleShip-->   Shipping    --ShipScheduled-->  (pivot)
```

- Pros: the whole flow is in one place, and it is easy to read, test and change.
- Cons: the orchestrator is an extra component, and it must not become a place for business logic that belongs to the services.
- Use it for longer sagas, or wherever you need to know the exact state of each operation.

## Saga state must be persisted

An orchestrator that keeps its progress only in memory loses it on restart, and then it cannot know which compensations to run. Store the saga's state in its own table, and update it in the same transaction as the step's record.

```sql
CREATE TABLE saga_instances (
  id           UUID PRIMARY KEY,
  saga_type    TEXT NOT NULL,
  current_step INT  NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPENSATING', 'COMPLETED', 'FAILED')),
  payload      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

A background worker looks for `RUNNING` and `COMPENSATING` sagas that have not moved for a while, and resumes them.

## Reliability: the outbox and idempotency

Two problems come up at every step:

- **Save and publish must not diverge.** If the service commits its change and then crashes before publishing the event, the saga stalls. Write the event to an **outbox** table in the same local transaction, and publish from the outbox afterwards. See [Kafka: Reliability and Delivery Semantics](/Kafka/Reliability-and-Delivery-Semantics).
- **Messages repeat.** Delivery is at least once, so every command and event must be safe to process twice. Include the `saga_id` and step number in each message. Each consumer records what it has already processed, and skips duplicates. See [Fault Tolerance](/DB/Fault-Tolerance).

## Timeouts mean unknown, not failed

When a step times out, the outcome is unknown. The charge may have succeeded, and only the reply was lost. Do not compensate straight away. Instead:

1. Query the participant for the status of that step, using the saga ID as the key.
2. If it succeeded, continue. If it failed, compensate. If it is still unknown, retry the idempotent request.

Compensating a step that never ran is also a risk, so compensations must tolerate that situation too.

## Example sketch

This is a sketch of orchestration logic, not a library API. It shows where state is saved and how compensation runs in reverse.

```java
void runOrder(SagaState saga) {
    try {
        reserveStock(saga);          // step 1, compensatable
        chargeCard(saga);            // step 2, compensatable
        scheduleShipment(saga);      // step 3, the pivot
        confirmOrder(saga);          // step 4, retried until it succeeds
        saga.complete();
    } catch (StepFailedBeforePivot e) {
        for (Step done : saga.completedStepsInReverse()) {
            done.compensate(saga);   // each compensation is retried until it succeeds
        }
        saga.fail();
    }
}
```

Every call above must be idempotent, and the saga state must be saved after each step.

## How to implement it

1. Write a table for the saga: each step, its command, its compensation, and whether it is the pivot.
2. Create the tables below. They hold the saga's progress, the messages waiting to be published, and the messages already handled.
3. Write the state change and the outbox row in one local transaction.
4. A relay publishes unpublished outbox rows to Kafka, then marks them published.
5. Each consumer records the message IDs it has handled, and skips any message it has seen before.
6. A recovery job resumes sagas that have stopped moving.

### Tables

```sql
CREATE TABLE saga_instances (
  id           UUID PRIMARY KEY,
  saga_type    TEXT NOT NULL,
  current_step INT  NOT NULL CHECK (current_step >= 0),
  status       TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPENSATING', 'COMPLETED', 'FAILED')),
  payload      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saga_stuck ON saga_instances (updated_at)
  WHERE status IN ('RUNNING', 'COMPENSATING');

CREATE TABLE saga_steps (
  saga_id  UUID NOT NULL REFERENCES saga_instances (id) ON DELETE CASCADE,
  step_no  INT  NOT NULL CHECK (step_no > 0),
  name     TEXT NOT NULL,
  state    TEXT NOT NULL CHECK (state IN ('PENDING', 'DONE', 'FAILED', 'COMPENSATED')),
  attempts INT  NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (saga_id, step_no)
);

CREATE TABLE outbox (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  saga_id      UUID  NOT NULL,
  topic        TEXT  NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unpublished ON outbox (id) WHERE published_at IS NULL;

CREATE TABLE inbox (
  message_id   UUID NOT NULL,
  consumer     TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, consumer)
);
```

The `CHECK` constraints stop a saga from being in a status that does not exist. The partial indexes keep the recovery and publishing queries small, because they only cover the rows they read.

### Handle each message once

```sql
INSERT INTO inbox (message_id, consumer) VALUES ($1, $2) ON CONFLICT DO NOTHING;
-- 1 row inserted: process the message. 0 rows: a duplicate, so skip it.
```

Checked: the first insert returned 1 row, and the repeat returned 0.

```java
@Transactional
public void handleStockReserved(UUID messageId, UUID sagaId) {
    int inserted = jdbc.update(
            "INSERT INTO inbox (message_id, consumer) VALUES (?, ?) ON CONFLICT DO NOTHING",
            messageId, "order-service");
    if (inserted == 0) {
        return;   // duplicate delivery: already handled
    }
    // advance the saga and insert the next outbox row in this same transaction
}
```

### Write the state change and the outbox row together (sketch)

```java
@Transactional
public void reserveStock(ReserveStock cmd) {
    inventory.reserve(cmd.sku(), cmd.quantity());   // local change
    jdbc.update(
            "INSERT INTO outbox (saga_id, topic, payload) VALUES (?, ?, ?::jsonb)",
            cmd.sagaId(), "inventory.events", toJson(new StockReserved(cmd.sagaId())));
}
```

The relay that publishes the outbox to Kafka should use idempotent, fully acknowledged producers:

```properties
enable.idempotence=true
acks=all
```

### Find stuck sagas

```sql
SELECT id, saga_type, status, updated_at
FROM saga_instances
WHERE status IN ('RUNNING', 'COMPENSATING')
  AND updated_at < now() - interval '5 minutes';
```

Each row goes back to the orchestrator, which resumes the saga or continues its compensation. A saga that sits in `COMPENSATING` for too long needs a person, because the compensation itself is failing.

## Common mistakes

- **Treating a compensation as a rollback.** A refund is a new charge with its own failure modes.
- **Compensations with no retry plan.** A compensation that fails once and gives up leaves the system inconsistent.
- **No timeouts**, so a step that never replies blocks the saga forever.
- **Assuming a timeout means failure** and compensating a step that actually succeeded.
- **Ignoring isolation.** Other requests act on `PENDING` data as if it were final.
- **Using a saga where one database transaction would do.** Keep a business operation inside one database whenever you can.
- **Choreography with a long chain of events.** The flow becomes impossible to follow. Switch to orchestration.
- **Keeping orchestrator state only in memory.**

## Testing it

- Test every compensation on its own, including when it runs twice.
- Crash the orchestrator between steps, restart it, and check that the saga finishes or compensates correctly.
- Deliver the same message twice and check that nothing happens twice.
- Inject a timeout after a step succeeds, and check that the saga does not compensate it wrongly.

## Key takeaways

- A saga is a sequence of local transactions, each with a compensation that reverses its business effect.
- Compensation is a new action, not a rollback. Some effects cannot be compensated, so plan a pivot.
- Sagas have no isolation, so mark in-progress state and recheck before acting.
- Choose choreography for short flows and orchestration for longer or harder-to-follow ones.
- Persist saga state, use an outbox, make every step idempotent, and treat a timeout as unknown.

Related: [ACID Transactions](/DB/ACID-Transactions), [Isolation Levels and Anomalies](/DB/Isolation-Levels-and-Anomalies), [Replication and Sharding](/DB/Replication-and-Sharding), [Multi-Region Database Design](/DB/Multi-Region-Database-Design), [Fault Tolerance](/DB/Fault-Tolerance), [Kafka: Reliability and Delivery Semantics](/Kafka/Reliability-and-Delivery-Semantics), [Java: Microservices Interview Prep](/Java/Microservices-Interview-Prep).
