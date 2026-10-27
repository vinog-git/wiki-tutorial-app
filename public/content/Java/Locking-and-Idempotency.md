# Locking Mechanisms & Idempotency Keys

## The Problem: Race Conditions

### Scenario: Bank Transfer ($100 from Account A to Account B)

```
Without Locking (WRONG):

Time  | Thread 1              | Thread 2              | Account A
------|----------------------|----------------------|----------
T1    | Read: $200          |                      | $200
T2    |                      | Read: $200           | $200
T3    | Calculate: 200-100  |                      |
T4    |                      | Calculate: 200-100  |
T5    | Write: $100         |                      | $100
T6    |                      | Write: $100          | $100  WRONG!

Expected: $100 (deducted once)
Actual:   $100 (deducted TWICE - lost $100!)

This is a RACE CONDITION - both threads saw the same old value
```

---

## Solution 1: Pessimistic Locking

### Concept: Lock Before Reading

```
With Pessimistic Locking (CORRECT):

Time  | Thread 1              | Thread 2              | Account A | Lock
------|----------------------|----------------------|----------|-------
T1    | Request Lock         |                      | $200     | Busy
T2    | Acquire Lock        | Request Lock (WAIT)  | $200     | Held T1
T3    | Read: $200          |                      | $200     | Held T1
T4    | Calculate: 200-100  | (Still waiting...)   | $200     | Held T1
T5    | Write: $100         | (Still waiting...)   | $100     | Held T1
T6    | Release Lock        | Acquire Lock        | $100     | Held T2
T7    |                      | Read: $100          | $100     | Held T2
T8    |                      | Calculate: 100-100  | $100     | Held T2
T9    |                      | Write: $0           | $0       | Held T2
T10   |                      | Release Lock        | $0       | Free

Thread 2 WAITS for the lock - it reads the updated value
```

### Code Example

```java
public class BankAccountPessimistic {
    private double balance;
    private Object lock = new Object();

    public void transferMoney(double amount) {
        synchronized (lock) {  // ACQUIRE LOCK
            double currentBalance = balance;
            balance = currentBalance - amount;
        }  // RELEASE LOCK
    }
}

// Thread 1: Locks → Reads $500 → Writes $400 → Unlocks
// Thread 2: Waits → Locks → Reads $400 → Writes $300 → Unlocks
// Result: $300  CORRECT
```

#### Output

Two threads each withdrawing $100 from a $500 balance. First **without** the lock:

```output
expected 300.0, got 400.0
```

Exactly the bug from the top of this page — both threads read $500, both computed $400, and one write overwrote the other. $100 vanished.

Now with `synchronized (lock)`:

```output
expected 300.0, got 300.0
```

The second thread cannot enter the block until the first has left it, so it reads $400 rather than the stale $500.

### Pros & Cons

**Pros:**
- Simple to understand
- Guaranteed consistency
- No conflicts possible

**Cons:**
- Threads BLOCK (wait) — slow performance
- Deadlock risk (threads wait for each other forever)
- Poor scalability under high load

### When to Use
- High conflict rate expected
- Consistency more important than speed
- Small datasets / short operations

---

## Solution 2: Optimistic Locking

### Concept: Check Version Before Updating

```
With Optimistic Locking (NO BLOCKING):

Time  | Thread 1                 | Thread 2                 | Account A | Version
------|-------------------------|-------------------------|----------|--------
T1    | Read: $500, v1         |                         | $500     | 1
T2    |                         | Read: $500, v1         | $500     | 1
T4    | Check: v1 == 1? YES    |                         | $500     | 1
T5    | Write: $400, v2         |                         | $400     | 2
T6    |                         | Check: v1 == 1? NO     | $400     | 2
T7    |                         | CONFLICT! Retry...     |          |
T8    |                         | Read: $400, v2         | $400     | 2
T9    |                         | Check: v2 == 2? YES    |          |
T10   |                         | Write: $300, v3        | $300     | 3

No thread blocks! Conflict resolved by RETRY.
```

### Code Example

```java
public class BankAccountOptimistic {
    private double balance = 500;
    private long version = 0;

    public boolean transferMoney(double amount) {
        for (int attempt = 0; attempt < 5; attempt++) {
            synchronized (this) {
                long currentVersion = this.version;
                double currentBalance = this.balance;

                if (this.version == currentVersion) {  // Version check
                    this.balance = currentBalance - amount;
                    this.version++;
                    return true;
                }
                // Version mismatch - retry
            }
        }
        return false;  // Failed after all retries
    }
}

// Thread 1: Read v0 → Write v1  SUCCESS
// Thread 2: Read v0 → Conflict (v is now 1) → Retry → Read v1 → Write v2  SUCCESS
// Result: $300  CORRECT (no blocking!)
```

#### Output

```output
balance=300.0  version=2
```

The version counter is the useful part of that output: it reached 2, meaning both transfers committed, each bumping it once. A version that stalls below the number of successful transfers means writes were lost.

In a real database this pattern becomes a conditional update, and the row count is the conflict signal:

```sql
UPDATE accounts SET balance = 400, version = 1
WHERE id = 1 AND version = 0;
```

```output
UPDATE 0
```

`UPDATE 0` means somebody else already moved the version on — re-read the row and retry. `UPDATE 1` means you won. JPA's `@Version` does exactly this and turns `UPDATE 0` into `OptimisticLockException`.

### Pros & Cons

**Pros:**
- No blocking — high concurrency
- No deadlock possible
- Better performance for read-heavy workloads

**Cons:**
- More complex code
- Retries needed on conflicts
- Can fail after max retries under heavy contention

### When to Use
- Low conflict rate
- Performance critical
- Read-heavy operations
- Distributed systems

---

## Solution 3: Idempotency Keys

### Concept: Cache Results by Unique Key

```
Problem It Solves: Network failures causing retries

Without Idempotency:
  User tries to pay $50
    Request sent to server
    Server processes: charges $50, returns success
    Network fails - response never reaches client
    Client retries (same payment)
    Server processes AGAIN: charges another $50
    User charged TWICE!

With Idempotency Key:
  Client generates unique key: "pay-user-123-001"
    Request with key sent to server
    Server: key not seen before → process payment
    Cache result: key → {status: success, amount: $50}
    Network fails
    Client retries with SAME key
    Server: key already seen! Return cached result
    No duplicate charge
```

### Code Example

```java
public class PaymentService {
    private Map<String, PaymentResult> cache = new ConcurrentHashMap<>();

    public PaymentResult pay(String idempotencyKey, double amount) {
        // Step 1: Check if already processed
        if (cache.containsKey(idempotencyKey)) {
            return cache.get(idempotencyKey);  // Return cached, no re-charge
        }

        // Step 2: Process for the first time
        PaymentResult result = chargeCard(amount);

        // Step 3: Cache the result
        cache.put(idempotencyKey, result);
        return result;
    }
}

// First request:  pay("pay-001", 50) → processes, caches, returns success
// Retry request:  pay("pay-001", 50) → returns cached result immediately
// New request:    pay("pay-002", 50) → processes as new transaction
```

#### Output

```output
first  pay-001 → PaymentResult[id=txn-1, amount=50.0, status=SUCCESS]
retry  pay-001 → PaymentResult[id=txn-1, amount=50.0, status=SUCCESS]
new    pay-002 → PaymentResult[id=txn-2, amount=50.0, status=SUCCESS]

actual card charges: 2
```

Three calls, **two** charges. The retry returned `txn-1` — the identical result object, not a new one — so the customer was not billed twice.

That last line is the assertion worth writing a test around. The retry returning a successful-looking response is not sufficient; what matters is that the side effect happened once.

Two things this simple version gets wrong for production:

- `containsKey` then `put` is **not atomic**. Two concurrent retries can both see an empty cache and both charge. Use `cache.computeIfAbsent(key, k -> chargeCard(amount))`, which holds the bin lock for the duration.
- An in-memory `ConcurrentHashMap` dies with the process and is not shared across instances. Real implementations persist the key, usually in the same database transaction as the charge.

### HTTP Example

```
POST /payments HTTP/1.1
Idempotency-Key: "pay-user-123-001"

{ "amount": 50.00, "accountId": 123 }

---

HTTP/1.1 200 OK
{ "status": "success", "transactionId": "txn-abc123", "amount": 50.00 }

If request times out, client retries with SAME Idempotency-Key.
Server recognizes key, returns cached response immediately.
No duplicate processing!
```

### Pros & Cons

**Pros:**
- Prevents duplicate processing
- Safe to retry requests
- Handles network failures gracefully

**Cons:**
- Requires storage (cache)
- Storage grows over time
- Doesn't prevent race conditions between threads

### When to Use
- Network-based APIs
- Payment processing
- POST/PUT/DELETE requests that can be retried
- Distributed systems

---

## Comparison: Which to Use?

| Aspect | Pessimistic | Optimistic | Idempotency |
|--------|-------------|------------|-------------|
| **Blocking?** | YES | NO | NO |
| **Performance** | Slow | Fast | Fast |
| **Complexity** | Simple | Complex | Medium |
| **Solves** | Race conditions | Race conditions | Duplicates |
| **Deadlock Risk** | YES | NO | NO |
| **Storage Overhead** | Low | Low | High (cache) |
| **Best For** | High conflict | Low conflict | Network APIs |

---

## Real-World Scenarios

### Scenario 1: Bank Transfer
```
Problem: Two simultaneous transfers from same account
Solution: PESSIMISTIC LOCKING
  Lock the account → Process transfer → Unlock
  Each transfer waits — consistency guaranteed
```

### Scenario 2: E-Commerce Inventory
```
Problem: Multiple users buying same product
Solution: OPTIMISTIC LOCKING
  No blocking (better user experience)
  Check stock version on update
  Conflicts rare → high throughput
```

### Scenario 3: Payment API
```
Problem: Network fails after payment processed
Solution: IDEMPOTENCY KEYS
  Client sends unique key with each request
  Retry returns cached result
  No double charging
```

### Scenario 4: Critical Financial System
```
Problem: All three issues at once
Solution: COMBINE ALL THREE!
  Idempotency key: prevent duplicate processing
  Optimistic lock: high concurrency
  Pessimistic lock: final consistency check
```

---

## Combined Approach: All Three Together

```java
public class RobustPaymentProcessor {
    private Map<String, TransactionResult> cache = new ConcurrentHashMap<>();  // Idempotency
    private int version = 0;                                                    // Optimistic
    private Object lock = new Object();                                         // Pessimistic

    public TransactionResult processPayment(
            String idempotencyKey,
            double amount,
            int expectedVersion) {

        // 1. IDEMPOTENCY: check if already processed
        if (cache.containsKey(idempotencyKey)) {
            return cache.get(idempotencyKey);
        }

        // 2. OPTIMISTIC: check version
        if (version != expectedVersion) {
            throw new RuntimeException("Concurrent modification detected");
        }

        // 3. PESSIMISTIC: lock critical section
        synchronized (lock) {
            TransactionResult result = chargeCard(amount);
            version++;
            cache.put(idempotencyKey, result);  // cache for idempotency
            return result;
        }
    }
}
```

---

## Key Takeaways

**Pessimistic Locking:**
- Lock BEFORE reading
- Threads BLOCK waiting for lock
- Simple but slow
- Example: `synchronized`, database row locks

**Optimistic Locking:**
- Check VERSION on update
- Threads do NOT block
- More complex but fast
- Example: version numbers, timestamps

**Idempotency Keys:**
- Cache results by UNIQUE KEY
- Safe to retry indefinitely
- Prevents duplicate processing
- Example: payment APIs, POST requests

**Combined:**
- Use all three together for critical operations
- Maximum safety and performance
- Highest complexity and cost

---

## Summary Table

| Mechanism | Lock Type | Blocking | Complexity | Use When |
|-----------|-----------|----------|-----------|----------|
| **Pessimistic** | Exclusive | YES | Simple | High conflict rate |
| **Optimistic** | None | NO | Complex | Low conflict rate |
| **Idempotency** | Cache | NO | Medium | Retries possible |
| **Combined** | All | Selective | Complex | Critical system |
