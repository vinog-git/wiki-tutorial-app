# Java Collectors

A **`Collector`** tells `Stream.collect()` how to fold a stream into a final result — a list, a map, a string, a statistic. **`Collectors`** is the utility class of ready-made ones.

```java
List<String> names = people.stream()
    .map(Person::getName)
    .collect(Collectors.toList());
```

The shared sample data used throughout this page:

```java
record Employee(int id, String name, String dept, double salary, int age) { }

List<Employee> employees = List.of(
    new Employee(1, "Alice",   "Engineering", 120_000, 34),
    new Employee(2, "Bob",     "Engineering",  95_000, 28),
    new Employee(3, "Charlie", "Sales",        80_000, 45),
    new Employee(4, "Diana",   "Sales",        85_000, 31),
    new Employee(5, "Eve",     "HR",           70_000, 26)
);
```

---

## Collecting Into Collections

```java
List<String> list  = stream.collect(Collectors.toList());          // some List, mutability unspecified
List<String> imm   = stream.collect(Collectors.toUnmodifiableList());
Set<String>  set   = stream.collect(Collectors.toSet());
Set<String>  imms  = stream.collect(Collectors.toUnmodifiableSet());

// Pick the exact implementation
TreeSet<String>   sorted = stream.collect(Collectors.toCollection(TreeSet::new));
LinkedList<String> linked = stream.collect(Collectors.toCollection(LinkedList::new));
ArrayDeque<String> deque = stream.collect(Collectors.toCollection(ArrayDeque::new));
```

`Stream.toList()` (Java 16+) is shorter and returns an **unmodifiable** list — prefer it unless you need a mutable result or a specific type:

```java
List<String> names = employees.stream().map(Employee::name).toList();
```

`Collectors.toList()` vs `Stream.toList()`:

| | `Collectors.toList()` | `Stream.toList()` |
|---|---|---|
| Mutability | unspecified (an `ArrayList` today) | unmodifiable |
| `null` elements | allowed | allowed |
| Composable into `groupingBy` etc. | yes | no — it's a terminal op, not a `Collector` |

---

## Collecting Into Maps

```java
// key → value
Map<Integer, String> idToName = employees.stream()
    .collect(Collectors.toMap(Employee::id, Employee::name));

// Whole object as the value
Map<Integer, Employee> byId = employees.stream()
    .collect(Collectors.toMap(Employee::id, e -> e));
```

#### Output

```output
{1=Alice, 2=Bob, 3=Charlie, 4=Diana, 5=Eve}
```

Keys come out `1..5` here only because small `Integer` keys land in ascending `HashMap` buckets — `toMap` promises no ordering. Pass `TreeMap::new` (below) when order matters.

**The duplicate-key trap.** Two-arg `toMap` throws `IllegalStateException: Duplicate key` on collision. Supply a merge function:

```java
// Sum salaries per department
Map<String, Double> salaryByDept = employees.stream()
    .collect(Collectors.toMap(Employee::dept, Employee::salary, Double::sum));

// Keep the first / keep the last
Map<String, Employee> firstPerDept = employees.stream()
    .collect(Collectors.toMap(Employee::dept, e -> e, (a, b) -> a));
Map<String, Employee> lastPerDept = employees.stream()
    .collect(Collectors.toMap(Employee::dept, e -> e, (a, b) -> b));

// Keep the highest earner
Map<String, Employee> topPerDept = employees.stream()
    .collect(Collectors.toMap(Employee::dept, e -> e,
        BinaryOperator.maxBy(Comparator.comparingDouble(Employee::salary))));

// Choose the map implementation (4-arg form) → sorted keys
TreeMap<String, Double> sortedByDept = employees.stream()
    .collect(Collectors.toMap(Employee::dept, Employee::salary, Double::sum, TreeMap::new));
```

#### Output

Without a merge function, two Engineering employees collide:

```java
employees.stream().collect(Collectors.toMap(Employee::dept, Employee::name));
```

```output
Exception in thread "main" java.lang.IllegalStateException: Duplicate key Engineering (attempted merging values Alice and Bob)
```

The message names the key and both competing values, which usually tells you straight away which field is not unique. With a merge function supplied, each variant above gives:

```output
salaryByDept   → {Engineering=215000.0, Sales=165000.0, HR=70000.0}
firstPerDept   → {Engineering=Alice, Sales=Charlie, HR=Eve}
lastPerDept    → {Engineering=Bob, Sales=Diana, HR=Eve}
sortedByDept   → {Engineering=215000.0, HR=70000.0, Sales=165000.0}
```

`firstPerDept` and `lastPerDept` differ only in `(a, b) -> a` versus `(a, b) -> b` — "keep what's already there" versus "let the newcomer win". And `sortedByDept` is the same data as `salaryByDept` with the keys in alphabetical order, because it collected into a `TreeMap`.

**The null-value trap.** `toMap` uses `Map.merge` internally, which throws `NullPointerException` if the value function returns `null` — even though `HashMap` happily stores null values. Use `Collectors.toMap(k, v -> Optional.ofNullable(...))` or fall back to a `reduce`/`forEach` when nulls are possible.

Also available: `Collectors.toConcurrentMap(...)` for parallel streams.

---

## Grouping

`groupingBy` is SQL's `GROUP BY`. It returns a `Map<K, List<T>>` by default.

```java
Map<String, List<Employee>> byDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept));
```

#### Output

```output
{Engineering=[Employee[id=1, name=Alice, dept=Engineering, salary=120000.0, age=34], Employee[id=2, name=Bob, dept=Engineering, salary=95000.0, age=28]], Sales=[Employee[id=3, name=Charlie, dept=Sales, salary=80000.0, age=45], Employee[id=4, name=Diana, dept=Sales, salary=85000.0, age=31]], HR=[Employee[id=5, name=Eve, dept=HR, salary=70000.0, age=26]]}
```

That is the auto-generated `toString` of a `record` — every component spelled out. It's verbose, which is exactly why the downstream collectors below are so useful: they cut each group down to just the value you need.

The second argument — a **downstream collector** — replaces that `List` with anything:

```java
// Count per group
Map<String, Long> countByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept, Collectors.counting()));

// Sum / average per group
Map<String, Double> totalByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept, Collectors.summingDouble(Employee::salary)));
Map<String, Double> avgByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept, Collectors.averagingDouble(Employee::salary)));

// Just the names per group
Map<String, List<String>> namesByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.mapping(Employee::name, Collectors.toList())));

// A set instead of a list
Map<String, Set<String>> nameSetByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.mapping(Employee::name, Collectors.toSet())));

// Max per group → Optional
Map<String, Optional<Employee>> topByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.maxBy(Comparator.comparingDouble(Employee::salary))));

// Max per group → unwrapped, no Optional
Map<String, Employee> topByDeptClean = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.collectingAndThen(
                 Collectors.maxBy(Comparator.comparingDouble(Employee::salary)),
                 Optional::get)));

// Choose the map type → sorted group keys
TreeMap<String, List<Employee>> sortedGroups = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept, TreeMap::new, Collectors.toList()));

// Nested grouping — group, then sub-group
Map<String, Map<Boolean, List<Employee>>> byDeptThenSenior = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.groupingBy(e -> e.salary() > 90_000)));

// Derive the key on the fly
Map<String, List<Employee>> byBand = employees.stream()
    .collect(Collectors.groupingBy(e -> e.salary() >= 100_000 ? "senior"
                                      : e.salary() >= 80_000  ? "mid" : "junior"));
```

#### Output

Each downstream collector, against the same five employees:

```output
countByDept       → {Engineering=2, Sales=2, HR=1}
totalByDept       → {Engineering=215000.0, Sales=165000.0, HR=70000.0}
avgByDept         → {Engineering=107500.0, Sales=82500.0, HR=70000.0}
namesByDept       → {Engineering=[Alice, Bob], Sales=[Charlie, Diana], HR=[Eve]}
topByDept         → {Engineering=Optional[Employee[...name=Alice...]], Sales=Optional[...Diana...], HR=Optional[...Eve...]}
topByDeptClean    → {Engineering=Employee[...name=Alice...], Sales=Employee[...Diana...], HR=Employee[...Eve...]}
byBand            → {senior=[Alice], mid=[Bob, Charlie, Diana], junior=[Eve]}
```

(`topByDept`, `topByDeptClean` and `byBand` hold whole `Employee` records; only the names are shown above so the lines fit.)

Two details worth pausing on:

- `counting()` gives `Long`, not `int` — `{Engineering=2}` is a `Long` 2. This bites when you try to assign it to a `Map<String, Integer>`.
- `topByDept` wraps each value in `Optional` because `maxBy` cannot promise a result for an empty group. `topByDeptClean` unwraps it with `collectingAndThen`, and is almost always what you actually want.

The `sortedGroups` and `byDeptThenSenior` variants produce:

```output
sortedGroups      → {Engineering=[...], HR=[...], Sales=[...]}
byDeptThenSenior  → {Engineering={true=[Alice, Bob]}, Sales={false=[Charlie, Diana]}, HR={false=[Eve]}}
```

Note what nested `groupingBy` does *not* do: Engineering has only a `true` key and Sales only a `false` key. Inner groups appear only when something lands in them — unlike `partitioningBy`, which always gives you both.

`groupingByConcurrent` is the parallel-friendly variant — it drops the encounter-order guarantee within groups in exchange for skipping the per-thread merge.

---

## Partitioning

`partitioningBy` is `groupingBy` specialised to a `Predicate`. It always returns a two-key `Map<Boolean, ...>` — **both keys are present even when a side is empty**, which is the practical difference from `groupingBy(e -> bool)`.

```java
Map<Boolean, List<Employee>> split = employees.stream()
    .collect(Collectors.partitioningBy(e -> e.salary() > 90_000));

split.get(true);   // high earners
split.get(false);  // everyone else

// With a downstream collector
Map<Boolean, Long> counts = employees.stream()
    .collect(Collectors.partitioningBy(e -> e.age() < 30, Collectors.counting()));
```

#### Output

```output
split.get(true)   → [Alice, Bob]
split.get(false)  → [Charlie, Diana, Eve]
counts            → {false=3, true=2}
```

Notice the `false` key comes first when the map is printed — `partitioningBy` returns a fixed two-entry map with `false` at index 0, not a `HashMap`.

---

## Joining Strings

```java
String names = employees.stream().map(Employee::name)
    .collect(Collectors.joining());                  // AliceBobCharlieDianaEve
String csv = employees.stream().map(Employee::name)
    .collect(Collectors.joining(", "));              // Alice, Bob, Charlie, Diana, Eve
String bracketed = employees.stream().map(Employee::name)
    .collect(Collectors.joining(", ", "[", "]"));    // [Alice, Bob, ...]
```

#### Output

```output
AliceBobCharlieDianaEve
Alice, Bob, Charlie, Diana, Eve
[Alice, Bob, Charlie, Diana, Eve]
```

`joining` only accepts a `Stream<CharSequence>` — `map` to a string first.

---

## Counting, Summing, Averaging, Statistics

```java
long   n     = employees.stream().collect(Collectors.counting());
double total = employees.stream().collect(Collectors.summingDouble(Employee::salary));
int    ages  = employees.stream().collect(Collectors.summingInt(Employee::age));
double avg   = employees.stream().collect(Collectors.averagingDouble(Employee::salary));

// Everything at once
DoubleSummaryStatistics stats = employees.stream()
    .collect(Collectors.summarizingDouble(Employee::salary));
stats.getCount(); stats.getSum(); stats.getMin(); stats.getMax(); stats.getAverage();

// Min / max as Optional
Optional<Employee> highest = employees.stream()
    .collect(Collectors.maxBy(Comparator.comparingDouble(Employee::salary)));
```

#### Output

```output
n        → 5
total    → 450000.0
ages     → 164
avg      → 90000.0
highest  → Optional[Employee[id=1, name=Alice, dept=Engineering, salary=120000.0, age=34]]
```

Printing the `DoubleSummaryStatistics` object directly gives you everything in one line:

```java
System.out.println(stats);
```

```output
DoubleSummaryStatistics{count=5, sum=450000.000000, min=70000.000000, average=90000.000000, max=120000.000000}
```

One pass over the data produces all five figures. Computing them separately would mean five passes.

Outside a `groupingBy`, prefer the direct stream methods — they're clearer and avoid boxing:

```java
long   n     = employees.stream().count();
double total = employees.stream().mapToDouble(Employee::salary).sum();
DoubleSummaryStatistics s = employees.stream().mapToDouble(Employee::salary).summaryStatistics();
Optional<Employee> highest = employees.stream().max(Comparator.comparingDouble(Employee::salary));
```

Use the `Collectors` versions when you need them **as a downstream collector**. That's the whole reason they exist.

---

## Adapting Collectors: mapping, filtering, flatMapping

These three only make sense downstream — they transform the elements *within* a group.

```java
// mapping: transform each element before collecting
Map<String, List<String>> namesByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.mapping(Employee::name, Collectors.toList())));

// filtering (Java 9+): keep the group key even if nothing survives the filter
Map<String, List<Employee>> highEarnersByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.filtering(e -> e.salary() > 90_000, Collectors.toList())));
// → HR maps to an EMPTY list, and is still a key
```

Contrast with filtering *before* grouping:

```java
employees.stream()
    .filter(e -> e.salary() > 90_000)
    .collect(Collectors.groupingBy(Employee::dept));
// → HR disappears entirely
```

#### Output

```output
filtering downstream  → {Engineering=[Alice, Bob], Sales=[], HR=[]}
filter before group   → {Engineering=[Alice, Bob]}
```

Same predicate, same data, different shape. With `Collectors.filtering` every department survives as a key, with an empty list where nobody qualified. Filtering first means Sales and HR never reach the collector at all, so those keys never exist — and `result.get("HR")` returns `null` instead of an empty list.

That distinction — empty group vs missing group — is a favourite interview question.

```java
// flatMapping (Java 9+): each element contributes many values
record Team(String name, List<String> members) { }

Map<String, List<String>> allMembersByTeamPrefix = teams.stream()
    .collect(Collectors.groupingBy(t -> t.name().substring(0, 1),
             Collectors.flatMapping(t -> t.members().stream(), Collectors.toList())));
```

#### Input

```java
List<Team> teams = List.of(
    new Team("Alpha", List.of("Ann", "Al")),
    new Team("Beta",  List.of("Ben")),
    new Team("Apex",  List.of("Amy", "Abe"))
);
```

#### Output

```output
{A=[Ann, Al, Amy, Abe], B=[Ben]}
```

Alpha and Apex both start with `A`, so their member lists are flattened together into one list of four. With `mapping` instead of `flatMapping` you would get `{A=[[Ann, Al], [Amy, Abe]], B=[[Ben]]}` — a list of lists.

---

## reducing and collectingAndThen

```java
// reducing: a Collector wrapper around a fold
Optional<Employee> topEarner = employees.stream()
    .collect(Collectors.reducing(
        BinaryOperator.maxBy(Comparator.comparingDouble(Employee::salary))));

// identity + operator → no Optional
double total = employees.stream()
    .collect(Collectors.reducing(0.0, Employee::salary, Double::sum));

// Longest name per department
Map<String, String> longestNameByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.reducing("", Employee::name,
                 (a, b) -> a.length() >= b.length() ? a : b)));

// collectingAndThen: post-process the finished result
List<String> immutableSorted = employees.stream()
    .map(Employee::name)
    .collect(Collectors.collectingAndThen(
        Collectors.toList(),
        l -> { l.sort(null); return List.copyOf(l); }));

// Unwrap the Optional from maxBy
Map<String, String> topNamePerDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.collectingAndThen(
                 Collectors.maxBy(Comparator.comparingDouble(Employee::salary)),
                 opt -> opt.map(Employee::name).orElse("none"))));
```

#### Output

```output
topEarner           → Optional[Employee[id=1, name=Alice, dept=Engineering, salary=120000.0, age=34]]
total               → 450000.0
longestNameByDept   → {Engineering=Alice, Sales=Charlie, HR=Eve}
immutableSorted     → [Alice, Bob, Charlie, Diana, Eve]
topNamePerDept      → {Engineering=Alice, Sales=Diana, HR=Eve}
```

`longestNameByDept` picks Charlie over Diana (7 letters beats 5) while `topNamePerDept` picks Diana over Charlie (85,000 beats 80,000) — same group, different question.

The `reducing("", ...)` form needs an identity that is safe to fold in: `""` works for "longest string" because every real name beats it. Pick the identity carelessly — `"zzzzzzzz"` here — and you get the identity back as the answer.

---

## teeing (Java 12+)

`teeing` runs **two** collectors over one pass and merges their results — no second traversal, no intermediate list.

```java
record Range(double min, double max) { }

Range range = employees.stream().collect(Collectors.teeing(
    Collectors.minBy(Comparator.comparingDouble(Employee::salary)),
    Collectors.maxBy(Comparator.comparingDouble(Employee::salary)),
    (min, max) -> new Range(min.map(Employee::salary).orElse(0.0),
                            max.map(Employee::salary).orElse(0.0))
));

// Count and sum in one pass
record Summary(long count, double total) { }
Summary summary = employees.stream().collect(Collectors.teeing(
    Collectors.counting(),
    Collectors.summingDouble(Employee::salary),
    Summary::new
));

// Above-average earners, single pass
List<Employee> aboveAvg = employees.stream().collect(Collectors.teeing(
    Collectors.averagingDouble(Employee::salary),
    Collectors.toList(),
    (avg, all) -> all.stream().filter(e -> e.salary() > avg).toList()
));
```

#### Output

```output
range     → Range[min=70000.0, max=120000.0]
summary   → Summary[count=5, total=450000.0]
aboveAvg  → [Alice (120000.0), Bob (95000.0)]
```

The third one is the case that justifies `teeing`: "who earns above average" needs the average before it can filter, which normally means traversing twice — once to compute it, once to filter. `teeing` runs both collectors over a single pass and hands you both results to combine. The average here is 90,000, so Alice and Bob survive.

---

## Quick Reference

| Collector | Result | Notes |
|-----------|--------|-------|
| `toList` / `toSet` | `List` / `Set` | mutability unspecified |
| `toUnmodifiableList/Set/Map` | immutable | Java 10+, rejects nulls |
| `toCollection(TreeSet::new)` | your choice | when the type matters |
| `toMap(k, v)` | `Map` | throws on duplicate keys |
| `toMap(k, v, merge)` | `Map` | resolves duplicates |
| `toMap(k, v, merge, TreeMap::new)` | your map type | |
| `groupingBy(fn)` | `Map<K, List<T>>` | |
| `groupingBy(fn, downstream)` | `Map<K, D>` | the workhorse |
| `partitioningBy(pred)` | `Map<Boolean, List<T>>` | both keys always present |
| `joining(sep, pre, suf)` | `String` | needs `CharSequence` elements |
| `counting` | `Long` | |
| `summing/averaging Int·Long·Double` | number | |
| `summarizing…` | `…SummaryStatistics` | count/sum/min/max/avg together |
| `minBy` / `maxBy` | `Optional<T>` | |
| `mapping(fn, down)` | transformed | downstream use |
| `filtering(pred, down)` | filtered, keeps empty groups | Java 9+ |
| `flatMapping(fn, down)` | flattened | Java 9+ |
| `reducing(id, fn, op)` | folded value | |
| `collectingAndThen(c, finish)` | post-processed | unwraps `Optional` |
| `teeing(c1, c2, merge)` | merged pair | Java 12+, one pass |
