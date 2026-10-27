# Custom Collectors — the `Collector` Interface

> **A note on naming.** There is no `Collectable` interface in Java. When people say "collectable" they mean one of two things: the **mutable container** a `Collector` accumulates into (`ArrayList`, `StringBuilder`, your own class), or the `Collector` **SPI** itself — the contract that makes a reduction pluggable into `stream().collect(...)`. This page covers both, plus the three-argument `collect` overload people often reach for first.

---

## The Contract

```java
public interface Collector<T, A, R> {
    Supplier<A>          supplier();       // create a fresh mutable container
    BiConsumer<A, T>     accumulator();    // fold one element into it
    BinaryOperator<A>    combiner();       // merge two containers (parallel only)
    Function<A, R>       finisher();       // container → final result
    Set<Characteristics> characteristics();
}
```

Three type parameters:

- **`T`** — the stream's element type (input).
- **`A`** — the *accumulation* type, the intermediate mutable container. Often invisible to callers.
- **`R`** — the result type.

For `Collectors.toList()` on a `Stream<String>`: `T = String`, `A = ArrayList<String>`, `R = List<String>`.
For `Collectors.joining()`: `T = CharSequence`, `A = StringJoiner`, `R = String`.

Execution, conceptually:

```
sequential:  A c = supplier();
             for (T t : elements) accumulator().accept(c, t);
             return finisher().apply(c);

parallel:    each thread gets its own supplier() container,
             accumulates its chunk,
             containers merge pairwise via combiner(),
             finisher() runs once on the result.
```

---

## Characteristics

```java
enum Characteristics { CONCURRENT, UNORDERED, IDENTITY_FINISH }
```

| Flag | Means | Consequence |
|------|-------|-------------|
| `IDENTITY_FINISH` | `finisher()` is the identity function | the framework skips calling it and casts `A` to `R` |
| `UNORDERED` | the result doesn't depend on encounter order | enables faster parallel paths (e.g. `toSet`) |
| `CONCURRENT` | the accumulator is safe for concurrent calls on **one** shared container | skips the split/merge entirely (`groupingByConcurrent`, `toConcurrentMap`) |

`CONCURRENT` without `UNORDERED` only takes the concurrent path if the stream is unordered, so in practice concurrent collectors declare both.

**If you declare `IDENTITY_FINISH`, `A` and `R` must be the same type** — the cast is unchecked and you'll get a `ClassCastException` at the call site otherwise.

---

## The Easy Path: the 3-arg `collect`

Before writing a `Collector` class, check whether `collect(supplier, accumulator, combiner)` suffices. It's the same machinery with an implicit identity finisher.

```java
// Build a list
List<String> names = employees.stream()
    .collect(ArrayList::new, (list, e) -> list.add(e.name()), ArrayList::addAll);

// Build a StringBuilder
StringBuilder sb = employees.stream()
    .collect(StringBuilder::new,
             (b, e) -> b.append(e.name()).append('\n'),
             StringBuilder::append);

// Build a BitSet of ids
BitSet ids = employees.stream()
    .collect(BitSet::new, (bs, e) -> bs.set(e.id()), BitSet::or);
```

#### Output

Against the five sample employees:

```output
names → [Alice, Bob, Charlie, Diana, Eve]
sb    → Alice\nBob\nCharlie\nDiana\nEve\n
ids   → {1, 2, 3, 4, 5}
```

`BitSet` prints as a set of the bit positions that are set — a compact way to hold a dense range of integer ids.

Use the full `Collector` interface when you need a **finisher** (the container isn't the answer), a **reusable named** collector, or **characteristics** control.

---

## Collector.of — the Practical Way to Build One

`Collector.of` is a static factory; you rarely `implements Collector` by hand.

```java
// Average as a BigDecimal with exact scale — no built-in collector does this
Collector<Employee, ?, BigDecimal> averageSalary = Collector.of(
    () -> new BigDecimal[]{ BigDecimal.ZERO, BigDecimal.ZERO },   // [sum, count]
    (acc, e) -> {
        acc[0] = acc[0].add(BigDecimal.valueOf(e.salary()));
        acc[1] = acc[1].add(BigDecimal.ONE);
    },
    (a, b) -> new BigDecimal[]{ a[0].add(b[0]), a[1].add(b[1]) },
    acc -> acc[1].signum() == 0
        ? BigDecimal.ZERO
        : acc[0].divide(acc[1], 2, RoundingMode.HALF_UP)
);

BigDecimal avg = employees.stream().collect(averageSalary);
```

#### Output

```output
90000.00
```

Note `90000.00`, not `90000.0` — the finisher's `divide(acc[1], 2, RoundingMode.HALF_UP)` fixes the scale at two decimal places, which is exactly the thing `Collectors.averagingDouble` cannot give you.

The empty case matters too, and is the reason for the `signum() == 0` guard:

```java
List.<Employee>of().stream().collect(averageSalary);
```

```output
0
```

Without that guard the finisher would divide by zero and throw `ArithmeticException` on an empty stream.

Note the `?` for `A`: the accumulation type is an implementation detail, so hide it from the signature.

With `IDENTITY_FINISH` (no finisher argument — the container *is* the result):

```java
Collector<String, ?, TreeSet<String>> toTreeSet = Collector.of(
    TreeSet::new,
    TreeSet::add,
    (a, b) -> { a.addAll(b); return a; },
    Collector.Characteristics.IDENTITY_FINISH,
    Collector.Characteristics.UNORDERED
);
```

---

## Worked Example: an Immutable-List Collector

```java
public final class MoreCollectors {

    public static <T> Collector<T, ?, List<T>> toImmutableList() {
        return Collector.of(
            ArrayList<T>::new,
            List::add,
            (left, right) -> { left.addAll(right); return left; },
            Collections::unmodifiableList          // the finisher
        );
    }
}

List<String> frozen = employees.stream().map(Employee::name)
    .collect(MoreCollectors.toImmutableList());
```

#### Output

```output
[Alice, Bob, Charlie, Diana, Eve]
```

```java
frozen.add("Frank");
```

```output
Exception in thread "main" java.lang.UnsupportedOperationException
	at java.base/java.util.Collections$UnmodifiableCollection.add(Collections.java:1093)
```

`A` is `ArrayList<T>`, `R` is `List<T>`, and because there's a real finisher we deliberately do **not** declare `IDENTITY_FINISH`.

Note `ArrayList<T>::new` rather than a bare `ArrayList::new`. The explicit type argument pins the accumulation type to `ArrayList<T>`; without it, inference settles on `ArrayList<Object>` and the finisher no longer type-checks:

```output
error: incompatible types: cannot infer type-variable(s) T,A,R,E
    (argument mismatch; invalid method reference
      incompatible types: ArrayList<Object> cannot be converted to List<? extends T>)
```

---

## Worked Example: a Bounded Top-N Collector

`sorted().limit(n)` sorts the whole stream — O(n log n) time and O(n) memory. A heap-backed collector is O(n log k) and holds only k elements.

```java
public static <T> Collector<T, ?, List<T>> topN(int n, Comparator<? super T> comparator) {
    return Collector.of(
        () -> new PriorityQueue<T>(comparator),           // min-heap: worst at the head
        (heap, item) -> {
            heap.offer(item);
            if (heap.size() > n) heap.poll();             // evict the worst
        },
        (a, b) -> {
            for (T item : b) {
                a.offer(item);
                if (a.size() > n) a.poll();
            }
            return a;
        },
        heap -> {
            List<T> out = new ArrayList<>(heap);
            out.sort(comparator.reversed());              // best first
            return out;
        }
    );
}

List<Employee> top3 = employees.stream()
    .collect(topN(3, Comparator.comparingDouble(Employee::salary)));

// Also usable as a downstream collector — top 2 earners per department
Map<String, List<Employee>> top2ByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             topN(2, Comparator.comparingDouble(Employee::salary))));
```

#### Output

```output
top3       → [Alice:120000, Bob:95000, Diana:85000]
top2ByDept → {Engineering=[Alice:120000, Bob:95000], Sales=[Diana:85000, Charlie:80000], HR=[Eve:70000]}
```

The finisher's `sort(comparator.reversed())` is what makes these come out **best-first**. Drop it and you get the raw heap order, where only the head is meaningful — the same trap as printing a `PriorityQueue` directly.

Note HR has only one employee, and `topN(2)` simply returns the one it has rather than padding or failing.

That last line is the real payoff of writing a `Collector` rather than a helper method: it composes into `groupingBy`.

---

## Worked Example: Statistics Into Your Own Type

Same shape as `DoubleSummaryStatistics`, but for a domain type. This is the canonical "mutable container" — a class whose whole job is to be accumulated into.

```java
public final class SalaryStats {
    private long count;
    private double sum;
    private double min = Double.POSITIVE_INFINITY;
    private double max = Double.NEGATIVE_INFINITY;

    void accept(Employee e) {                 // the accumulator
        count++;
        sum += e.salary();
        min = Math.min(min, e.salary());
        max = Math.max(max, e.salary());
    }

    SalaryStats merge(SalaryStats other) {     // the combiner
        count += other.count;
        sum   += other.sum;
        min    = Math.min(min, other.min);
        max    = Math.max(max, other.max);
        return this;
    }

    public long   count()   { return count; }
    public double sum()     { return sum; }
    public double min()     { return count == 0 ? 0 : min; }
    public double max()     { return count == 0 ? 0 : max; }
    public double average() { return count == 0 ? 0 : sum / count; }

    public static Collector<Employee, ?, SalaryStats> collector() {
        return Collector.of(SalaryStats::new, SalaryStats::accept, SalaryStats::merge);
    }
}

SalaryStats all = employees.stream().collect(SalaryStats.collector());

Map<String, SalaryStats> perDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept, SalaryStats.collector()));
```

#### Output

```output
all     → SalaryStats{count=5, sum=450000.0, min=70000.0, max=120000.0, avg=90000.0}
perDept → {Engineering=SalaryStats{count=2, sum=215000.0, min=95000.0, max=120000.0, avg=107500.0},
           Sales=SalaryStats{count=2, sum=165000.0, min=80000.0, max=85000.0, avg=82500.0},
           HR=SalaryStats{count=1, sum=70000.0, min=70000.0, max=70000.0, avg=70000.0}}
```

(Wrapped across lines to fit; it prints as one line.)

The empty-stream case is the one to check, and it is why `min()` and `max()` guard on `count == 0`:

```java
List.<Employee>of().stream().collect(SalaryStats.collector());
```

```output
SalaryStats{count=0, sum=0.0, min=0.0, max=0.0, avg=0.0}
```

Without those guards you would get `min=Infinity, max=-Infinity` — the sentinel values leaking out to the caller.

Three properties make a type a good accumulation container: a **no-arg constructor** (for the supplier), a **void mutating method** (for the accumulator), and an **associative merge** (for the combiner).

---

## Rules Your Collector Must Obey

1. **The combiner must be associative.** `combine(combine(a, b), c)` must equal `combine(a, combine(b, c))`. Subtraction and "last one wins" are not associative — they give different answers under different parallel splits.
2. **The supplier must return a *fresh* container every call.** Returning a shared instance (`() -> SHARED_LIST`) corrupts results in parallel and leaks state between reuses of the collector.
3. **Don't mutate inputs, don't rely on identity.** The accumulator sees elements in arbitrary order under parallelism.
4. **Only claim `CONCURRENT` if the accumulator is genuinely thread-safe on one shared container.** `ArrayList::add` is not.
5. **`IDENTITY_FINISH` requires `A == R`.**
6. **Empty streams must work.** The finisher runs on a container that never saw an element — guard divisions and `min`/`max` sentinels, as `SalaryStats` does above.

A quick way to smoke-test associativity and supplier freshness:

```java
var expected = employees.stream().collect(myCollector);
var parallel = employees.parallelStream().collect(myCollector);
assert expected.equals(parallel);
assert employees.stream().collect(myCollector).equals(expected);   // reuse is clean
assert List.<Employee>of().stream().collect(myCollector) != null;  // empty case
```

#### Output

Running that check against the `topN` collector above:

```output
sequential → [Alice:120000, Bob:95000, Diana:85000]
parallel   → [Alice:120000, Bob:95000, Diana:85000]
```

Identical, which is what a correct combiner buys you. A non-associative combiner typically still passes on a five-element list — the stream never actually splits — and only diverges once the data is big enough to fan out. Test with a list of at least a few thousand elements if you want the check to mean anything.

---

## Composing Instead of Writing One

Before writing a collector, check whether composition already gets you there:

```java
// "Sorted immutable names per department" — no custom collector needed
Map<String, List<String>> namesByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.collectingAndThen(
                 Collectors.mapping(Employee::name, Collectors.toList()),
                 l -> { l.sort(null); return List.copyOf(l); })));

// "Count and sum in one pass" — teeing, not a custom collector
record Pair(long count, double total) { }
Pair p = employees.stream().collect(Collectors.teeing(
    Collectors.counting(), Collectors.summingDouble(Employee::salary), Pair::new));
```

Write a custom `Collector` when the composition becomes unreadable, when you need better complexity than composition allows (the `topN` heap), or when the reduction is a reusable domain concept (`SalaryStats`).

---

## `reduce` vs `collect`

| | `reduce` | `collect` |
|---|---|---|
| Works on | immutable values | mutable containers |
| Per element | allocates a new accumulated value | mutates in place |
| Signature | `(identity, accumulator, combiner)` returning `U` | `(supplier, accumulator, combiner)` returning `A` |
| Use for | sums, products, min/max, `String` folds you'd regret | lists, maps, buffers, statistics |

The classic wrong answer:

```java
// O(n²) — every concat copies the whole string
String bad = names.stream().reduce("", (a, b) -> a + b);

// O(n) — one mutable buffer
String good = names.stream().collect(Collectors.joining());
```

And the classic parallel bug — a shared mutable container reached from a lambda:

```java
List<String> out = new ArrayList<>();
names.parallelStream().forEach(out::add);   // BROKEN: ArrayList isn't thread-safe

List<String> ok = names.parallelStream().toList();   // correct
```

#### Output

Four consecutive runs over a 100,000-element list:

```output
expected 100000, got 14979 (contains nulls)
expected 100000, got 12328 (contains nulls)
threw java.lang.ArrayIndexOutOfBoundsException
threw java.lang.ArrayIndexOutOfBoundsException
```

Four runs, four different results: two silently lost ~85% of the data *and* left `null` holes in the list, two blew up outright. Nothing here is deterministic, and nothing warns you.

The correct version is boring by comparison:

```output
toList() → expected 100000, got 100000
```

This is also why the five-element examples earlier in this page are a bad way to test: at that size the stream never splits, `forEach(out::add)` appears to work perfectly, and the bug stays hidden until production.
