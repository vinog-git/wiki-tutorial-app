# Locking & Idempotency - Quick Reference

## The Problem: Race Condition

### Bank Transfer Example

```
Initial: Account = $500
Goal: Deduct $100 twice (withdraw $200 total)
Expected Result: $300

WITHOUT LOCKING:

Thread 1:  Read($500) → Calculate(500-100=400) → Wait → Write($400)
Thread 2:  Read($500) → Calculate(500-100=400) → Wait → Write($400)
                                                               |
                                             Final Result: $400  WRONG!

Only $100 was deducted, not $200!
Both threads read the SAME old value before either wrote the new value.
```

---

## Solution 1: Pessimistic Locking

### How It Works: "Lock Before You Look"

```
Thread 1: "I need to access this resource"
            |
          [LOCK] - Only one thread can hold this
            |
Thread 1: Read($500) → Calculate → Write($400)
            |
          [UNLOCK] - Release for others
            |
Thread 2: "Can I access?" → "Yes, it's free now"
            |
          [LOCK] - Acquire lock
            |
Thread 2: Read($400) → Calculate → Write($300)
            |
          [UNLOCK]

Final Result: $300  CORRECT!
```

### Code

```java
public class BankAccount {
    private double balance = 500;
    private Object lock = new Object();

    public void withdraw(double amount) {
        synchronized (lock) {  // ACQUIRE LOCK
            double current = balance;
            balance = current - amount;
        }  // RELEASE LOCK
    }
}
```

#### Output

Two threads, each withdrawing $100 from $500. Without the lock:

```output
expected 300.0, got 400.0
```

With `synchronized (lock)`:

```output
expected 300.0, got 300.0
```

The broken run is the one to internalise: it did not throw, did not warn, and produced a plausible-looking balance. Lost updates are silent.

### Pros & Cons

```
PROS:
  Simple to understand
  100% consistency guaranteed
  Works everywhere

CONS:
  Threads BLOCK/WAIT (slow)
  Poor performance under load
  Deadlock risk
  Bad scalability
```

### When to Use
- High conflict rate expected
- Consistency more important than speed
- Small datasets, simple systems

---

## Solution 2: Optimistic Locking

### How It Works: "Check Version Before Committing"

```
Thread 1: Read($500, version=1)
Thread 2: Read($500, version=1)

Thread 1: Check: version still 1? YES
          Write($400, version=2)

Thread 2: Check: version still 1? NO (it's now 2)
          CONFLICT! RETRY...
          Read($400, version=2)
          Check: version still 2? YES
          Write($300, version=3)

Final Result: $300  CORRECT!
```

### Code

```java
public class BankAccount {
    private double balance = 500;
    private long version = 0;

    public boolean withdraw(double amount) {
        for (int attempt = 0; attempt < 5; attempt++) {
            synchronized (this) {
                long currentVersion = this.version;
                double current = this.balance;

                if (this.version == currentVersion) {
                    this.balance = current - amount;
                    this.version++;
                    return true;
                }
            }
            // Version mismatch - retry
        }
        return false;
    }
}
```

#### Output

```output
balance=300.0  version=2
```

Version 2 after two transfers means both committed. If the version had stopped at 1, one update was lost.

### Pros & Cons

```
PROS:
  No blocking (high concurrency)
  Better performance
  No deadlock possible
  Scalable

CONS:
  More complex code
  Retries on conflict
  Can fail if conflicts too high
```

### When to Use
- Low conflict rate expected
- Performance critical
- Many concurrent users, read-heavy workloads

---

## Solution 3: Idempotency Keys

### How It Works: "Don't Process Twice"

```
First Request:
Client: "Pay $50 with key 'pay-001'"
  |
Server: "Key 'pay-001'? Never seen it. Process payment."
  |
Server: [Charges card] → [Caches result]
  |
Server: Return success

Network fails - client doesn't get response

Retry Request (Same Key):
Client: "Pay $50 with key 'pay-001'"  <- Same key!
  |
Server: "Key 'pay-001'? Already processed! Here's cached result."
  |
Result: Charged $50 ONCE  (not twice)
```

### Code

```java
public class PaymentService {
    private Map<String, PaymentResult> cache = new ConcurrentHashMap<>();

    public PaymentResult processPayment(String idempotencyKey, double amount) {
        if (cache.containsKey(idempotencyKey)) {
            return cache.get(idempotencyKey);  // Return cached result
        }

        PaymentResult result = chargeCard(amount);
        cache.put(idempotencyKey, result);
        return result;
    }
}
```

#### Output

```output
first  pay-001 → PaymentResult[id=txn-1, amount=50.0, status=SUCCESS]
retry  pay-001 → PaymentResult[id=txn-1, amount=50.0, status=SUCCESS]
new    pay-002 → PaymentResult[id=txn-2, amount=50.0, status=SUCCESS]

actual card charges: 2
```

Three calls, two charges — the retry returned the cached `txn-1` rather than billing again.

Note that `containsKey` followed by `put` is not atomic; under concurrent retries use `cache.computeIfAbsent(key, k -> chargeCard(amount))` instead.

### HTTP Example

```
POST /api/pay HTTP/1.1
Idempotency-Key: pay-user-123-001
Content-Type: application/json

{ "amount": 50.00, "accountId": 123 }
```

### Pros & Cons

```
PROS:
  Prevents duplicate processing
  Safe to retry (idempotent)
  Handles network failures
  Simple concept

CONS:
  Needs storage (cache)
  Cache management overhead
  Doesn't prevent conflicts
  Storage grows over time
```

### When to Use
- Network-based APIs
- Payment processing
- POST/PUT/DELETE requests that may be retried

---

## Side-by-Side Comparison

| Aspect | Pessimistic | Optimistic | Idempotency |
|--------|-------------|------------|-------------|
| **How** | Lock before read | Check version before update | Cache by key |
| **Blocking?** | YES | NO | NO |
| **Performance** | Slow | Fast | Fast |
| **Complexity** | Simple | Complex | Medium |
| **Solves** | Conflicts | Conflicts | Duplicates |
| **Deadlock Risk** | YES | NO | NO |
| **Storage** | Low | Low | High (cache) |
| **Best For** | High conflict, simple systems | Distributed systems, high perf | APIs, payments, retries |

---

## Real-World Scenarios

### Bank Transfer
```
Problem: Two simultaneous transfers from same account
Solution: PESSIMISTIC LOCKING
  Lock account → Process transfer → Unlock
```

### Inventory Management
```
Problem: Multiple users buying same product
Solution: OPTIMISTIC LOCKING
  Check stock version on update
  Conflicts rare → high throughput
```

### Payment Processing
```
Problem: Network fails after payment processed
Solution: IDEMPOTENCY KEYS
  Client retries with same key
  Server returns cached result, no double charge
```

### Critical Financial System
```
Problem: All three issues at once
Solution: COMBINE ALL THREE!
  Idempotency key → prevent duplicates
  Optimistic lock → high concurrency
  Pessimistic lock → final safety check
```

---

## Code Patterns

### Pattern 1: Pessimistic (Lock It Up)

```java
synchronized (lock) {      // LOCK
    int value = data;      // Read
    value = value - 100;   // Modify
    data = value;          // Write
}                          // UNLOCK
```

### Pattern 2: Optimistic (Retry on Conflict)

```java
for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
    synchronized (this) {
        long currentVersion = version;
        int currentValue = value;

        if (version == currentVersion) {   // Version check
            value = currentValue - 100;
            version++;
            return true;
        }
    }
    // Version mismatch - loop retries
}
```

### Pattern 3: Idempotency (Check Cache)

```java
if (cache.containsKey(key)) {
    return cache.get(key);      // Return cached result
}

Result result = doWork();       // Process first time
cache.put(key, result);         // Cache it
return result;
```

---

## Quick Decision Tree

```
                  START
                    |
                    +-- Local operation? (single server/DB)
                    |   YES --> Conflicts frequent?
                    |           YES --> PESSIMISTIC LOCKING
                    |           NO  --> OPTIMISTIC LOCKING
                    |
                    +-- Over network? (API, distributed)
                        YES --> Can operation be retried?
                                YES --> IDEMPOTENCY KEYS
                                NO  --> PESSIMISTIC LOCKING

Need maximum safety?
  Use ALL THREE together!
```

---

## Key Formulas

### Pessimistic Locking Cost
```
Total Time = Lock Acquire + Process + Lock Release
           + (Threads Waiting × Lock Hold Time)
```

### Optimistic Locking Cost
```
Total Time = Process Time + (Conflicts × Retry Time)
```

### Idempotency Storage Cost
```
Storage = (Number of Requests) × (Result Size)
```

---

## Summary

| Mechanism | Best For | How | Cost |
|-----------|----------|-----|------|
| **Pessimistic** | High conflict | Lock first | Time (blocking) |
| **Optimistic** | Low conflict | Check version | Time (retries) |
| **Idempotency** | Network APIs | Cache results | Space (storage) |
| **All Three** | Critical systems | Combined | Highest |

See **Locking-and-Idempotency** for full explanations and runnable code examples.
