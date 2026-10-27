# Java Multithreading

## What is a Thread?

A thread is a lightweight unit of execution. Java allows multiple threads to run concurrently inside a single program, enabling tasks to happen in parallel — like downloading a file while updating a progress bar.

---

## Creating Threads

### Method 1: Extend the Thread Class

Subclass `Thread` and override its `run()` method. Call `start()` — not `run()` — to launch the thread.

```java
public class MyThread extends Thread {
    private String name;

    public MyThread(String name) {
        this.name = name;
    }

    @Override
    public void run() {
        for (int i = 0; i < 5; i++) {
            System.out.println(name + " - " + i);
            try {
                Thread.sleep(1000);  // Sleep 1 second
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }
}

MyThread thread1 = new MyThread("Thread-1");
MyThread thread2 = new MyThread("Thread-2");

thread1.start();  // Don't call run(), call start()!
thread2.start();
```

#### Output

Thread output is **non-deterministic** — the two threads interleave differently on each run. One actual run:

```output
Thread-1 - 0
Thread-2 - 0
Thread-1 - 1
Thread-2 - 1
Thread-2 - 2
Thread-1 - 2
```

Run it again and the lines will come out in a different order. Never write code (or a test) that depends on a particular interleaving.

> **Important:** Calling `run()` directly executes on the current thread — no concurrency. Always use `start()`.

This is easy to see by printing the thread name:

```java
Thread t = new Thread(() ->
    System.out.println("executing on: " + Thread.currentThread().getName()));

t.start();   // starts a new thread
t.run();     // just a normal method call
```

```output
executing on: Thread-0
executing on: main
```

`start()` hands the work to a new thread; `run()` executes it on `main` like any other method. The program still compiles and still prints — which is exactly why this bug is so easy to miss.

---

### Method 2: Implement Runnable (Preferred)

Implementing `Runnable` is preferred because Java only supports single class inheritance. With `Runnable` your class can still extend another class.

```java
public class MyTask implements Runnable {
    private String name;

    public MyTask(String name) {
        this.name = name;
    }

    @Override
    public void run() {
        for (int i = 0; i < 5; i++) {
            System.out.println(name + " - " + i);
        }
    }
}

Thread thread3 = new Thread(new MyTask("Task-1"));
Thread thread4 = new Thread(new MyTask("Task-2"));

thread3.start();
thread4.start();
```

#### Output

One run, with the loop shortened to three iterations:

```output
Task-1 - 0
Task-1 - 1
Task-1 - 2
Task-2 - 0
Task-2 - 1
Task-2 - 2
```

These tasks finished in order simply because each one is over in microseconds — the first thread was done before the second got going. That is **not** a guarantee; add a `Thread.sleep` inside the loop and they will interleave.

---

### Method 3: Lambda Expression (Java 8+)

For short tasks, a lambda is the most concise option.

```java
Thread thread5 = new Thread(() -> {
    System.out.println("Running in thread");
});
thread5.start();
```

---

## Threads in Depth: Lifecycle, Blocking and I/O

### Multithreading vs Blocking I/O

**Multithreading** means several threads make progress in one program. It helps when work is CPU-bound (on a multi-core machine) or when threads spend time waiting.

**Blocking I/O** means a thread calls a read or write (file, socket, database, HTTP) and **stops until the operation completes**. The thread does nothing else while it waits, even though the CPU is idle. Most I/O calls in classic Java (`InputStream.read()`, `Socket.getInputStream()`, JDBC `executeQuery()`) are blocking.

| Situation | What the thread does | Fix |
|---|---|---|
| CPU-heavy loop | Uses a core fully | More threads, up to the number of cores |
| Waiting for a network reply | Sits idle, holds its stack and resources | Run I/O calls on other threads, or use non-blocking I/O |
| Waiting for a lock | Blocked by `synchronized` | Shorten the critical section; use concurrent collections |

The key point: **threads are cheap to wait with, not free**. A platform thread costs roughly a megabyte of stack. Ten thousand threads all blocked on I/O is a lot of memory, which is why thread pools and virtual threads exist.

### Thread lifecycle

A thread moves through these states, available from `Thread.getState()`:

| State | Meaning |
|---|---|
| `NEW` | Created but `start()` not yet called |
| `RUNNABLE` | Running, or ready to run and waiting for the CPU. Blocked-on-I/O threads also show here. |
| `BLOCKED` | Waiting to enter a `synchronized` block |
| `WAITING` | Waiting indefinitely (`join()`, `wait()`, `LockSupport.park()`) |
| `TIMED_WAITING` | Waiting with a timeout (`sleep(ms)`, `wait(ms)`, `join(ms)`) |
| `TERMINATED` | `run()` has returned or thrown an exception |

```java
Thread worker = new Thread(() -> {
    try {
        Thread.sleep(500);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();   // restore the flag for callers
    }
});

System.out.println(worker.getState());   // NEW
worker.start();
System.out.println(worker.getState());   // RUNNABLE
Thread.sleep(100);
System.out.println(worker.getState());   // TIMED_WAITING
worker.join();
System.out.println(worker.getState());   // TERMINATED
```

```output
NEW
RUNNABLE
TIMED_WAITING
TERMINATED
```

### Thread control: join, sleep, interrupt, daemon

```java
Thread download = new Thread(() -> System.out.println("Downloading..."));
download.setDaemon(false);      // default: JVM waits for this thread before exiting
download.start();
download.join();                // current thread waits until download finishes
System.out.println("Download complete");
```

```output
Downloading...
Download complete
```

- **`join()`** waits for another thread to finish.
- **`interrupt()`** asks a thread to stop. The thread must check for it, and blocking methods such as `sleep()` throw `InterruptedException` when interrupted.
- **Daemon threads** do not keep the JVM alive. Use them for background housekeeping only.

### Blocking I/O in practice: sequential vs parallel

Three slow HTTP calls, each taking about one second, show the difference. Sequentially the total is about three seconds. On a thread pool it is about one second.

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.*;

public class BlockingIoDemo {
    static final HttpClient client = HttpClient.newHttpClient();

    // Each call blocks the calling thread until the response arrives
    static String fetch(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url)).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString()).body();
    }

    public static void main(String[] args) throws Exception {
        List<String> urls = List.of(
            "https://httpbin.org/delay/1",
            "https://httpbin.org/delay/1",
            "https://httpbin.org/delay/1");

        // Sequential: one thread waits three times in a row (~3 s)
        long start = System.currentTimeMillis();
        for (String url : urls) {
            fetch(url);
        }
        System.out.println("Sequential: " + (System.currentTimeMillis() - start) + " ms");

        // Parallel: three threads wait at the same time (~1 s)
        ExecutorService pool = Executors.newFixedThreadPool(3);
        start = System.currentTimeMillis();
        List<Future<String>> futures = urls.stream()
            .map(url -> pool.submit(() -> fetch(url)))
            .toList();
        for (Future<String> f : futures) {
            f.get();                                  // blocks until that result is ready
        }
        pool.shutdown();
        System.out.println("Parallel: " + (System.currentTimeMillis() - start) + " ms");
    }
}
```

```output
Sequential: 3120 ms
Parallel: 1080 ms
```

The timings vary with the network. The pattern does not: the parallel version overlaps the waiting, not the computing.

### Thread pools

Creating a thread per task is slow and unbounded. An `ExecutorService` reuses a fixed set of threads.

| Factory method | Behaviour | Use when |
|---|---|---|
| `newFixedThreadPool(n)` | Exactly n threads; extra tasks queue | Bounded parallelism, such as calling a rate-limited API |
| `newCachedThreadPool()` | Creates threads as needed, reuses idle ones | Many short tasks |
| `newSingleThreadExecutor()` | One thread, tasks in order | Sequential background work |
| `newVirtualThreadPerTaskExecutor()` | One virtual thread per task (Java 21+) | Many blocking I/O tasks |

Always shut the pool down, or the JVM keeps running:

```java
ExecutorService pool = Executors.newFixedThreadPool(4);
try {
    // submit work
} finally {
    pool.shutdown();
    pool.awaitTermination(30, TimeUnit.SECONDS);
}
```

### Virtual threads (Java 21)

A **virtual thread** is scheduled by the JVM onto a few carrier platform threads. When it blocks on I/O, it is unmounted from its carrier, so the carrier runs other virtual threads. You can write simple blocking code and still have very high concurrency.

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 10_000; i++) {
        executor.submit(() -> {
            Thread.sleep(Duration.ofSeconds(1));   // blocks only this virtual thread
            return "done";
        });
    }
}   // close() waits for all tasks to finish
```

Ten thousand one-second sleeps finish in about one second, because the JVM parks each virtual thread while it waits. Virtual threads help with I/O waiting. They do not make CPU-heavy code faster.

| | Platform thread | Virtual thread |
|---|---|---|
| Managed by | OS | JVM |
| Typical count | Hundreds | Millions |
| Cost when blocked | Holds an OS thread | Unmounts; carrier is free |
| Best for | CPU-bound work | Blocking I/O at high concurrency |

**Pinning:** a virtual thread stays on its carrier while inside `synchronized`. Prefer `ReentrantLock` in code that blocks while holding a lock.

---

## Synchronization

When multiple threads access shared data, a **race condition** can occur — two threads read and write the same value at the same time, producing incorrect results. `synchronized` prevents this by allowing only one thread into the marked block at a time.

### Synchronized Method

```java
public class Counter {
    private int count = 0;

    public synchronized void increment() {
        count++;
    }

    public synchronized int getCount() {
        return count;
    }
}
```

#### Try it

`count++` looks atomic but is really three operations — read, add one, write back. Two threads can read the same value and both write back the same result, losing an increment. Four threads incrementing 100,000 times each should give 400,000:

```java
Counter counter = new Counter();
Thread[] threads = new Thread[4];
for (int i = 0; i < 4; i++) {
    threads[i] = new Thread(() -> {
        for (int j = 0; j < 100_000; j++) counter.increment();
    });
    threads[i].start();
}
for (Thread t : threads) t.join();
System.out.println(counter.getCount());
```

Three consecutive runs **without** `synchronized` on `increment()`:

```output
186358
239129
400000
```

And with `synchronized`:

```output
400000
```

The third unsynchronized run is the dangerous one: it produced the right answer by luck. A race condition that passes your test today can still fail in production — which is why correctness here has to come from the locking, never from observed behaviour.

### Synchronized Block (More Granular)

Locking only the critical section (instead of the whole method) gives better performance.

```java
public class BankAccount {
    private double balance = 1000;

    public void withdraw(double amount) {
        synchronized (this) {  // Lock only this critical section
            if (balance >= amount) {
                balance -= amount;
                System.out.println("Withdrawn: " + amount);
            }
        }
    }
}
```

---

## Deadlock

A deadlock occurs when two threads each hold a lock the other needs, so both wait forever.

```java
public class DeadlockExample {
    private static Object lock1 = new Object();
    private static Object lock2 = new Object();

    public static void main(String[] args) {
        // Thread 1: acquires lock1, wants lock2
        Thread t1 = new Thread(() -> {
            synchronized (lock1) {
                System.out.println("Thread 1 has lock1");
                try { Thread.sleep(100); } catch (InterruptedException e) {}
                synchronized (lock2) {
                    System.out.println("Thread 1 has lock2");
                }
            }
        });

        // Thread 2: acquires lock2, wants lock1
        Thread t2 = new Thread(() -> {
            synchronized (lock2) {
                System.out.println("Thread 2 has lock2");
                try { Thread.sleep(100); } catch (InterruptedException e) {}
                synchronized (lock1) {
                    System.out.println("Thread 2 has lock1");
                }
            }
        });

        t1.start();
        t2.start();
        // DEADLOCK! Both threads wait forever
    }
}
```

#### Output

```output
Thread 1 has lock1
Thread 2 has lock2
```

Then nothing. The program prints two lines and hangs forever — it never reaches `has lock2` or `has lock1`, and the JVM does not exit. You have to kill it.

That silence is what makes deadlock nasty: there is no exception, no error, no stack trace. The `Thread.sleep(100)` simply makes it reliable — without it the threads often finish too fast to collide, so the bug would show up only occasionally under load.

To confirm a hang is a deadlock, run `jstack <pid>` (or press Ctrl-\ in the terminal). The JVM detects the cycle and names it:

```output
Found one Java-level deadlock:
=============================
"Thread-0":
  waiting to lock monitor 0x... (object 0x..., a java.lang.Object),
  which is held by "Thread-1"
"Thread-1":
  waiting to lock monitor 0x... (object 0x..., a java.lang.Object),
  which is held by "Thread-0"
```

### How to Avoid Deadlock

- ✓ Acquire locks in the **same order** in every thread
- ✓ Minimize the time a lock is held
- ✓ Use a timeout: `lock.tryLock(timeout, unit)`
- ✓ Use `ReentrantLock` instead of `synchronized` for more control

---

## Practical Example: Producer-Consumer

A classic multithreading pattern where one thread produces items and another consumes them. They coordinate using `wait()` and `notifyAll()` on a shared queue.

```java
public class ProducerConsumer {
    private static final LinkedList<Integer> queue = new LinkedList<>();
    private static final int CAPACITY = 5;

    static class Producer implements Runnable {
        @Override
        public void run() {
            for (int i = 1; i <= 10; i++) {
                synchronized (queue) {
                    while (queue.size() == CAPACITY) {
                        try {
                            queue.wait();  // Wait if queue is full
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        }
                    }
                    queue.add(i);
                    System.out.println("Produced: " + i);
                    queue.notifyAll();  // Wake up consumer
                }
            }
        }
    }

    static class Consumer implements Runnable {
        @Override
        public void run() {
            while (true) {
                synchronized (queue) {
                    while (queue.isEmpty()) {
                        try {
                            queue.wait();  // Wait if queue is empty
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        }
                    }
                    Integer item = queue.poll();
                    System.out.println("Consumed: " + item);
                    queue.notifyAll();  // Wake up producer
                }
            }
        }
    }
}

// Usage
Thread producer = new Thread(new ProducerConsumer.Producer());
Thread consumer = new Thread(new ProducerConsumer.Consumer());
producer.start();
consumer.start();
```

#### Output

One actual run, with `CAPACITY = 5`:

```output
Produced: 1
Produced: 2
Produced: 3
Produced: 4
Produced: 5
Consumed: 1
Consumed: 2
Consumed: 3
Consumed: 4
Consumed: 5
Produced: 6
Produced: 7
Produced: 8
Produced: 9
Produced: 10
Consumed: 6
Consumed: 7
Consumed: 8
Consumed: 9
Consumed: 10
```

The shape of this output is the whole lesson. The producer runs ahead until the queue hits five items, then `queue.wait()` parks it and the consumer drains the queue; `notifyAll()` wakes the producer to fill it again. The exact interleaving varies between runs — you may well see produces and consumes alternate one-for-one — but **the queue never exceeds five**, because that is enforced by the `while` loop rather than by timing.

Two details that are easy to get wrong:

- The waits are in a `while` loop, not an `if`. A thread can wake up without the condition being true (a *spurious wakeup*, or another consumer grabbing the item first), so the condition must be re-checked after waking.
- The consumer above loops forever. As written it never terminates — after `Consumed: 10` the program hangs waiting for an eleventh item. Give the consumer a stop condition, or use a poison-pill value, if you want it to exit.

In production code, reach for `BlockingQueue` instead:

```java
BlockingQueue<Integer> queue = new ArrayBlockingQueue<>(5);
queue.put(i);     // blocks when full
queue.take();     // blocks when empty
```

It does all of the above — the capacity check, the waiting, the waking — with no `synchronized`, `wait` or `notifyAll` anywhere in your code.

---

## Thread Safety Best Practices

| Practice | Why |
|----------|-----|
| Use `synchronized` blocks, not entire methods | Locks only the critical section — better performance |
| Use `ReentrantLock` for fine-grained control | Supports timeouts, try-lock, fair ordering |
| Use `ConcurrentHashMap` instead of `HashMap` | Thread-safe without blocking the whole map |
| Use `CopyOnWriteArrayList` for read-heavy workloads | Reads never block; writes copy the array |
| Use `volatile` for simple flags | Guarantees visibility across threads without locking |
| Use `wait()`/`notifyAll()` for producer-consumer | Coordinates threads efficiently on a shared object |

---

## Interview Questions

**What causes deadlock and how do you prevent it?**
Deadlock happens when two threads each hold a lock the other needs and neither releases first. Prevent it by always acquiring locks in the same order across all threads, keeping lock scope small, or using `tryLock()` with a timeout.

**Explain synchronization and when to use it.**
`synchronized` ensures only one thread executes a block at a time, preventing race conditions on shared mutable state. Use it on the smallest critical section possible — over-synchronizing hurts performance. Prefer concurrent collections (`ConcurrentHashMap`) when they fit, as they handle locking internally.
