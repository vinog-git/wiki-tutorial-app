# Java 17 vs Java 21

Both are **LTS** (Long Term Support) releases, so both get years of security patches — which is why most teams are sitting on one of these two and nothing in between.

| | Java 17 | Java 21 |
|---|---|---|
| Released | September 2021 | September 2023 |
| Free Oracle updates until | Sept 2024 (paid after) | Sept 2026 (paid after) |
| Headline feature | Sealed classes, records go final | **Virtual threads** |
| Spring Boot | 3.0+ baseline | 3.2+ recommended |
| Previous LTS | Java 11 | Java 17 |

Java 21 is a superset: everything in 17 still works. The question is never "which is better" but "is the upgrade worth the migration cost" — the answer is usually yes, and this page covers both the wins and the traps.

---

## The Big One: Virtual Threads

This is the single reason most teams upgrade. Everything else is a nice-to-have.

### The Java 17 problem

A platform thread is a thin wrapper over an OS thread. Each one costs ~1 MB of stack, and the OS scheduler starts choking somewhere in the low thousands. So for an I/O-bound server you size a pool and queue everything else:

```java
// Java 17: 200 threads, and request 201 waits in a queue
ExecutorService pool = Executors.newFixedThreadPool(200);

for (int i = 0; i < 10_000; i++) {
    pool.submit(() -> {
        // Thread parks here doing nothing but holding 1MB of stack
        String data = httpClient.send(request, ofString()).body();
        return process(data);
    });
}
```

Ten thousand requests, each blocking 100 ms on a database call. With 200 threads that's 50 rounds of waiting — about 5 seconds of wall clock, almost all of it threads sleeping while the CPU idles.

The Java 17 escape hatch was to go reactive (`CompletableFuture`, WebFlux, RxJava) — which works, but it colours your whole codebase: everything becomes callbacks, stack traces become unreadable, and debuggers stop being useful.

### The Java 21 answer

A **virtual thread** is scheduled by the JVM, not the OS. It costs a few hundred bytes, and when it blocks on I/O the JVM unmounts it from its carrier thread and runs something else. You can have millions.

```java
// Java 21: one virtual thread per task, no pool sizing at all
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 10_000; i++) {
        executor.submit(() -> {
            String data = httpClient.send(request, ofString()).body();
            return process(data);
        });
    }
} // close() waits for every task to finish
```

#### Output

Both versions, measured on a JDK 21 build with 10,000 tasks that each sleep 100 ms:

```output
fixed pool of 200 platform threads: 5051 ms
virtual thread per task:             195 ms
```

A 26× difference, and not because virtual threads compute anything faster — the work is identical, and it is all waiting. The pooled version can only have 200 tasks waiting at once, so it grinds through 50 rounds of 100 ms. The virtual-thread version has all 10,000 waiting simultaneously, so the whole run costs about as much as one call.

This is also the shape of the result to expect: the virtual-thread time barely moves as you raise the task count, while the pooled time scales linearly.

Same blocking code, same readable stack traces, same debugger — but all 10,000 run concurrently. Wall clock drops to roughly the 100 ms of a single call.

### Creating them directly

```java
// Fire and forget
Thread.startVirtualThread(() -> System.out.println("hello"));

// Builder, when you want a name or want to start it later
Thread t = Thread.ofVirtual()
                 .name("order-processor-", 0)   // auto-numbered
                 .start(() -> handleOrder(id));
t.join();

// Platform threads still exist and still have their uses
Thread p = Thread.ofPlatform().daemon().start(() -> pollQueue());
```

```output
running on VirtualThread[#10046,order-processor-0]/runnable@ForkJoinPool-1-worker-14
```

The `toString` is informative: `order-processor-0` is the name from the builder's auto-numbering, and `ForkJoinPool-1-worker-14` is the **carrier** platform thread it is currently mounted on. That carrier changes across a blocking call — which is exactly the mechanism, and exactly why you must never use a thread identity as a lock or a map key with virtual threads.

### Spring Boot 3.2+

One property, and Tomcat serves every request on a virtual thread:

```properties
spring.threads.virtual.enabled=true
```

### When virtual threads do NOT help

Be honest about this in interviews — it's the follow-up question.

| Workload | Benefit |
|---|---|
| Blocking I/O (DB, HTTP, file) | **Huge** — this is the use case |
| CPU-bound number crunching | **None** — you still only have N cores |
| Already fully reactive code | Little — you've already solved it |

Virtual threads raise your concurrency ceiling, not your throughput ceiling. A CPU-bound task on a virtual thread is just a CPU-bound task with extra steps.

### The `synchronized` pinning trap

In Java 21, a virtual thread that blocks **inside a `synchronized` block** cannot unmount — it *pins* its carrier thread, and you're back to a limited pool. Under load this deadlocks quietly.

```java
// BAD on Java 21: blocks while holding the monitor, pins the carrier
public synchronized void save(Order o) {
    jdbcTemplate.update(...);   // blocking I/O inside synchronized
}

// GOOD: ReentrantLock is virtual-thread aware and unmounts correctly
private final ReentrantLock lock = new ReentrantLock();

public void save(Order o) {
    lock.lock();
    try {
        jdbcTemplate.update(...);
    } finally {
        lock.unlock();
    }
}
```

Diagnose it with `-Djdk.tracePinnedThreads=full`. This was fixed in Java 24 (JEP 491), but on 21 you must audit `synchronized` blocks that perform I/O.

---

## Pattern Matching: 17 vs 21

Java 17 gave you `instanceof` patterns. Java 21 finished the job with switch patterns and record deconstruction.

### Java 17

```java
sealed interface Shape permits Circle, Rectangle, Triangle {}
record Point(int x, int y) {}
record Circle(Point center, double radius) implements Shape {}
record Rectangle(Point topLeft, Point bottomRight) implements Shape {}
record Triangle(Point a, Point b, Point c) implements Shape {}

// instanceof patterns work, but it's still an if-else ladder
static String describe(Shape shape) {
    if (shape instanceof Circle c) {
        Point p = c.center();                    // manual accessor calls
        if (c.radius() > 100) {
            return "Big circle at " + p.x() + "," + p.y();
        }
        return "Circle radius " + c.radius();
    } else if (shape instanceof Rectangle r) {
        return "Rectangle from " + r.topLeft();
    } else if (shape instanceof Triangle t) {
        return "Triangle";
    }
    throw new IllegalStateException("Unknown shape"); // compiler can't verify
}
```

### Java 21

```java
static String describe(Shape shape) {
    return switch (shape) {
        // Record pattern: destructure Circle AND its nested Point in one go
        case Circle(Point(var x, var y), double r) when r > 100 ->
            "Big circle at %d,%d".formatted(x, y);
        case Circle(Point p, double r) -> "Circle radius " + r;
        case Rectangle(Point tl, Point br) -> "Rectangle from " + tl;
        case Triangle t -> "Triangle";
        // No default needed - Shape is sealed, so the compiler proves
        // this is exhaustive. Add a 4th shape and this stops compiling.
    };
}
```

#### Input

```java
describe(new Circle(new Point(5, 7), 150));
describe(new Circle(new Point(5, 7), 50));
describe(new Rectangle(new Point(0, 0), new Point(4, 3)));
```

#### Output

```output
Big circle at 5,7
Circle radius 50.0
Rectangle from Point[x=0, y=0]
```

The first two calls are both `Circle` and differ only in radius — the `when r > 100` guard picks the branch. Note also that the nested `Point` was destructured straight into `x` and `y` in the first case, while the second bound the whole `Point` as `p`; you choose the depth per case.

Three things Java 17 could not do:

1. **Type patterns in `switch`** — `case Circle c ->` instead of an `instanceof` chain.
2. **Record patterns** — `case Circle(Point(var x, var y), double r)` destructures nested records.
3. **Guards with `when`** — a condition attached to a case label.

### Null handling in switch

```java
// Java 17: switch throws NullPointerException on a null selector
// Java 21: you can handle it as a case
String result = switch (obj) {
    case null      -> "nothing";
    case Integer i when i > 100 -> "big int";
    case Integer i -> "int " + i;
    case String s  -> "string of length " + s.length();
    default        -> "something else";
};
```

#### Output

Feeding it `null, 500, 7, "hello", 3.14`:

```output
nothing
big int
int 7
string of length 5
something else
```

Both `Integer` cases are reachable and order matters: `500` hits the guarded branch, `7` falls through to the unguarded one. Swap them and the guarded case becomes dead code — which the compiler will tell you about.

If you omit `case null`, Java 21 keeps the old behaviour and throws NPE — so existing code is safe.

---

## Sequenced Collections (Java 21)

A small API that fixes a long-standing wart. "Give me the first element" had a different spelling for every collection type.

```java
// Java 17 - inconsistent and ugly
list.get(0);                                  // List
list.get(list.size() - 1);
deque.getFirst();                             // Deque
sortedSet.first();                            // SortedSet
linkedHashSet.iterator().next();              // LinkedHashSet - no other way
linkedHashMap.entrySet().iterator().next();   // LinkedHashMap
```

Java 21 adds `SequencedCollection`, `SequencedSet` and `SequencedMap`, retrofitted onto the existing types:

```java
// Java 21 - same names everywhere
list.getFirst();
list.getLast();
list.reversed();          // a reversed VIEW, not a copy

linkedHashSet.getFirst();
linkedHashSet.addFirst("x");

linkedHashMap.firstEntry();
linkedHashMap.putFirst("k", "v");
linkedHashMap.reversed();
```

| Interface | Implemented by | Key methods |
|---|---|---|
| `SequencedCollection` | `List`, `Deque` | `getFirst`, `getLast`, `addFirst`, `addLast`, `reversed` |
| `SequencedSet` | `LinkedHashSet`, `SortedSet` | the above, plus set semantics |
| `SequencedMap` | `LinkedHashMap`, `SortedMap` | `firstEntry`, `lastEntry`, `putFirst`, `putLast`, `reversed` |

#### Output

```output
list.getFirst() / getLast() / reversed()  → a / c / [c, b, a]
linkedHashSet.getFirst()                  → x
linkedHashSet.addFirst("w")               → [w, x, y, z]
linkedHashMap.firstEntry() / lastEntry()  → a=1 / b=2
linkedHashMap.putFirst("z", 0)            → {z=0, a=1, b=2}
linkedHashMap.reversed()                  → {b=2, a=1, z=0}
```

`putFirst` on a `LinkedHashMap` is genuinely new capability, not just new spelling — before Java 21 there was no way to insert at the front of one short of rebuilding it.

`reversed()` returns a **view**, so it costs nothing to create, but writes through to the original. Wrap it in a copy if you need independence.

**Migration gotcha:** if you have your own class implementing `List` with an existing `getFirst()` that returns something incompatible, it will no longer compile on 21. Rare, but it happens in older codebases.

---

## Smaller Library Additions

Everything in Java 18, 19 and 20 also lands in 21. The ones you will actually use:

```java
// Math.clamp - Java 21, replaces Math.min(Math.max(...)) noise
int volume = Math.clamp(userInput, 0, 100);

// StringBuilder.repeat - Java 21
sb.repeat("-", 40);

// String.formatted - Java 15, worth knowing
"Hello %s".formatted(name);

// Simple web server for static files - Java 18
// $ jwebserver -p 8000 -d /path/to/files

// HexFormat - Java 17
HexFormat.of().formatHex(bytes);
```

```output
Math.clamp(150, 0, 100)          → 100
new StringBuilder().repeat("-", 20) → --------------------
"Hello %s".formatted("world")    → Hello world
```

`Math.clamp` also throws `IllegalArgumentException` if you pass `min > max`, which the old `Math.min(Math.max(...))` idiom would silently accept and return nonsense for.

### Preview features in 21 — use with care

These need `--enable-preview` at both compile and run time, and are **not** for production:

| Preview in 21 | Status now |
|---|---|
| Structured Concurrency (`StructuredTaskScope`) | Still evolving, API changed after 21 |
| Scoped Values (`ScopedValue`) | Still evolving |
| String Templates (`STR."..."`) | **Withdrawn** in Java 23 — do not build on it |
| Unnamed patterns (`case Circle(_, var r)`) | Finalized in Java 22 |

String templates are the cautionary tale: it shipped as a preview in 21, a lot of blog posts treated it as a Java 21 feature, and then it was pulled entirely. Preview means preview.

---

## Performance and GC

Java 21 is meaningfully faster on the same code — typically 5-15% throughput on server workloads, mostly from G1 and JIT improvements. No code change required.

```bash
# Java 17: ZGC is single-generation, scans the whole heap every cycle
java -XX:+UseZGC -jar app.jar

# Java 21: generational ZGC, opt-in. Much lower CPU cost for the same pauses
java -XX:+UseZGC -XX:+ZGenerational -jar app.jar
```

Generational ZGC became the default in Java 23, so on 21 you must ask for it explicitly.

| | Java 17 | Java 21 |
|---|---|---|
| Default GC | G1 | G1 (improved) |
| ZGC | Single generation | Generational (opt-in flag) |
| Typical ZGC pause | < 1 ms | < 1 ms, at lower CPU cost |
| Startup | Baseline | Modestly faster |

---

## Migration Gotchas: 17 → 21

The upgrade is usually a one-line change in `pom.xml` plus a week of fixing these.

```xml
<properties>
    <maven.compiler.release>21</maven.compiler.release>
</properties>
```

### 1. UTF-8 is the default charset (changed in Java 18)

The most common real-world breakage. `new FileReader(f)`, `new String(bytes)` and friends used to follow the OS locale. Since 18 they are always UTF-8.

```java
// Behaves differently on Java 17 (Windows-1252 on some hosts) vs 21 (always UTF-8)
String s = new String(Files.readAllBytes(path));

// Always specify the charset and the problem disappears on both
String s = Files.readString(path, StandardCharsets.UTF_8);
```

Escape hatch while you fix call sites: `-Dfile.encoding=COMPAT`.

### 2. Dynamic agent loading warns

Java 21 prints a warning when an agent is attached at runtime. This hits Mockito's inline mock maker and several profilers — noisy CI logs, and it becomes an error in a later release.

```bash
java -XX:+EnableDynamicAgentLoading -jar app.jar
```

Better: upgrade Mockito to 5.x, which handles this properly.

### 3. Strong encapsulation of JDK internals

Already enforced in 17 (JEP 403), but worth re-checking if you are coming from 11 via 17. `sun.misc.Unsafe` and friends need explicit `--add-opens`. Old Lombok, old Hibernate and old bytecode tools are the usual offenders.

### 4. Library baseline bumps

Anything that manipulates bytecode must understand class file version 65:

- Lombok — needs 1.18.30+
- ASM / ByteBuddy / CGLIB — latest
- Gradle — 8.5+ for full Java 21 support
- Spring Boot — 3.2+ for virtual thread support

### 5. Audit `synchronized` before enabling virtual threads

See the pinning trap above. Do this *before* flipping `spring.threads.virtual.enabled=true`, not after.

---

## Which Should You Use?

**Use Java 21** for anything new, and plan the upgrade for anything on 17. Oracle's free updates for 17 ended in September 2024; the migration is small; the performance is free; and virtual threads genuinely change how you write I/O-bound services.

**Stay on Java 17** only if a vendor or platform constraint forces it — an app server that isn't certified, an Android toolchain, or a dependency stuck on an old bytecode library.

---

## Interview Questions

**Q: What is the difference between a platform thread and a virtual thread?**

A platform thread maps 1:1 to an OS thread — ~1 MB of stack, scheduled by the OS, expensive to create, so you pool them. A virtual thread is scheduled by the JVM onto a small pool of carrier threads — a few hundred bytes, cheap enough to create one per task and throw it away. When a virtual thread blocks on I/O, the JVM unmounts it and runs another on the same carrier.

**Q: Do virtual threads make my application faster?**

Only if it is I/O-bound. They raise how many concurrent tasks you can have in flight, not how much CPU work you can do. A CPU-bound workload sees no benefit, because you are still limited by core count.

**Q: What is thread pinning?**

A virtual thread that blocks while inside a `synchronized` block cannot unmount from its carrier thread, so the carrier is held hostage. Under load this collapses your effective concurrency to the number of carriers. Fix it by using `ReentrantLock` instead; detect it with `-Djdk.tracePinnedThreads=full`.

**Q: Why doesn't this switch need a `default` branch?**

Because the selector type is a `sealed` interface and there is a case for every permitted subtype, so the compiler can prove the switch is exhaustive. It's also a safety net: adding a new permitted subtype turns every such switch into a compile error, which is exactly where you want to find out.

**Q: What is a record pattern?**

Destructuring in a pattern: `case Circle(Point(var x, var y), double r)` matches a `Circle` and binds its components — including nested ones — to variables in one step, instead of matching the type and then calling accessors.

**Q: Name a Java 17 → 21 change that can break working code.**

The default charset became UTF-8 in Java 18. Any code relying on the platform default encoding — `new FileReader`, `new String(byte[])`, `PrintStream` without a charset — can change behaviour. The fix is to pass an explicit charset.
