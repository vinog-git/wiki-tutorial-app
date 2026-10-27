# Interview Questions: Sorting (With and Without Collectors)

Sorting comes up in almost every Java interview because it touches `Comparable`, `Comparator`, generics, streams, stability, and mutability all at once. Questions below are grouped: **fundamentals**, **sorting without collectors**, **sorting with collectors**, and **gotchas**.

The shared sample data:

```java
record Employee(int id, String name, String dept, double salary, int age) { }

List<Employee> employees = new ArrayList<>(List.of(
    new Employee(1, "Alice",   "Engineering", 120_000, 34),
    new Employee(2, "Bob",     "Engineering",  95_000, 28),
    new Employee(3, "Charlie", "Sales",        80_000, 45),
    new Employee(4, "Diana",   "Sales",        85_000, 31),
    new Employee(5, "Eve",     "HR",           70_000, 26)
));
```

---

## Fundamentals

### Q: What's the difference between `Comparable` and `Comparator`?

`Comparable<T>` is implemented **by the class itself** and defines its single *natural ordering* via `compareTo(T other)`. `Comparator<T>` is a **separate object** defining an *external* ordering via `compare(T a, T b)` — you can have as many as you like.

```java
// Comparable — one natural order, baked into the type
class Employee implements Comparable<Employee> {
    public int compareTo(Employee other) {
        return Integer.compare(this.id, other.id);
    }
}

// Comparator — many orders, defined outside the type
Comparator<Employee> bySalary = Comparator.comparingDouble(Employee::salary);
Comparator<Employee> byName   = Comparator.comparing(Employee::name);
```

Use `Comparable` when there is one obvious, intrinsic order (id, timestamp). Use `Comparator` for everything else, and always when you can't modify the class.

### Q: What must `compareTo`/`compare` return?

Negative if `a` sorts before `b`, zero if they're equivalent for ordering, positive if after. The contract also requires:

- **Antisymmetry**: `sgn(compare(a,b)) == -sgn(compare(b,a))`
- **Transitivity**: `compare(a,b) > 0 && compare(b,c) > 0` ⟹ `compare(a,c) > 0`
- **Consistency**: `compare(a,b) == 0` ⟹ `sgn(compare(a,c)) == sgn(compare(b,c))`

Violate them and `Arrays.sort` throws `IllegalArgumentException: Comparison method violates its general contract!` — usually from `a - b` overflow or an inconsistent multi-field comparison.

### Q: Why is `return a.getAge() - b.getAge()` a bug?

Integer overflow. If `a.getAge()` is `Integer.MIN_VALUE + 1` and `b.getAge()` is a large positive, the subtraction wraps and returns the wrong sign. Always use the static helpers:

```java
Integer.compare(a.age(), b.age());
Double.compare(a.salary(), b.salary());   // also handles NaN and ±0.0 correctly
Long.compare(a.ts(), b.ts());
```

`Double.compare` matters doubly: `>`/`<` on `NaN` are all false, so a hand-rolled double comparator breaks the contract for `NaN`.

### Q: Is `compareTo` required to be consistent with `equals`?

Not required, but **strongly recommended** — and required in practice for `TreeSet`/`TreeMap`, which use `compareTo` (not `equals`) to decide identity. A class whose `compareTo` returns 0 for objects that aren't `equals` will silently drop entries:

```java
// compareTo compares salary only
TreeSet<Employee> set = new TreeSet<>(Comparator.comparingDouble(Employee::salary));
set.add(new Employee(1, "Alice", "Eng", 100_000, 30));
set.add(new Employee(2, "Bob",   "Eng", 100_000, 40));
System.out.println(set.size());
System.out.println(set);
```

```output
1
[Alice]
```

Bob is gone. He was never rejected with an error — `add` returned `false` and the code carried on. Two employees with identical salaries are indistinguishable to a salary-only comparator, and `TreeSet` treats "compares equal" as "is a duplicate".

Fix by making the comparator total: `.thenComparing(Employee::id)`.

```output
2
[Alice, Bob]
```

### Q: Which sort algorithm does Java use?

- `Arrays.sort(primitives)` → **dual-pivot quicksort**. Not stable, but stability is meaningless for primitives. O(n log n) average, in place.
- `Arrays.sort(Object[])` / `Collections.sort` / `List.sort` / `Stream.sorted` → **TimSort** (a merge sort / insertion sort hybrid). **Stable**, O(n log n) worst case, needs O(n) auxiliary space, and runs in O(n) on already-sorted or nearly-sorted input.

### Q: What does "stable sort" mean, and why does it matter?

A stable sort preserves the relative order of elements that compare equal. It lets you sort by multiple keys in successive passes:

```java
employees.sort(Comparator.comparing(Employee::name));    // pass 1: secondary key
employees.sort(Comparator.comparing(Employee::dept));    // pass 2: primary key
// → sorted by dept, and within a dept still by name
```

#### Output

```output
[Alice, Bob, Eve, Charlie, Diana]
```

Reading it back: Engineering (Alice, Bob), HR (Eve), Sales (Charlie, Diana) — departments in order, and **within** Engineering the names are still alphabetical from pass 1. That surviving inner order is precisely what stability means. With an unstable sort, pass 2 would be free to scramble Alice and Bob.

Note the passes run in *reverse* key priority. A single `thenComparing` chain is clearer and faster.

---

## Sorting Without Collectors

### Q: Sort a list in place — what are the options?

```java
Collections.sort(employees);                                        // needs Comparable
Collections.sort(employees, Comparator.comparing(Employee::name));  // legacy form
employees.sort(Comparator.comparing(Employee::name));               // preferred, Java 8+
employees.sort(null);                                               // natural order
```

`List.sort` is the modern one — it's a default method on `List` and implementations can override it (`ArrayList.sort` sorts its backing array directly, skipping the copy `Collections.sort` used to make).

All three **mutate** the list, so they fail on `List.of(...)`, `Arrays.asList(...).sort` works (fixed size, mutable elements) but `List.of(...).sort` throws `UnsupportedOperationException`.

### Q: Sort without mutating the original?

```java
// Stream — returns a new list
List<Employee> sorted = employees.stream()
    .sorted(Comparator.comparing(Employee::name))
    .toList();

// Or copy then sort
List<Employee> copy = new ArrayList<>(employees);
copy.sort(Comparator.comparing(Employee::name));
```

### Q: Sort descending — three ways?

```java
employees.sort(Comparator.comparingDouble(Employee::salary).reversed());
employees.sort(Collections.reverseOrder(Comparator.comparingDouble(Employee::salary)));
employees.sort((a, b) -> Double.compare(b.salary(), a.salary()));   // swap the operands
```

#### Output

All three produce the same thing:

```output
[Alice, Bob, Diana, Charlie, Eve]
```

Salaries 120k, 95k, 85k, 80k, 70k.

Prefer `.reversed()` — swapping operands by hand is the classic off-by-one-thought bug in code review.

### Q: Multi-field sort — department ascending, then salary descending, then name?

```java
Comparator<Employee> cmp = Comparator
    .comparing(Employee::dept)
    .thenComparing(Comparator.comparingDouble(Employee::salary).reversed())
    .thenComparing(Employee::name);

employees.sort(cmp);
```

**Watch where `.reversed()` lands.** It reverses *everything to its left*:

```java
// dept DESC and salary DESC — probably not what you meant
Comparator.comparing(Employee::dept)
          .thenComparingDouble(Employee::salary)
          .reversed();

// dept ASC, salary DESC — reverse only the one key
Comparator.comparing(Employee::dept)
          .thenComparing(Employee::salary, Comparator.reverseOrder());
```

#### Output

Printed as `dept/name`, the difference is immediate:

```output
.thenComparingDouble(salary).reversed()          → [Sales/Diana, Sales/Charlie, HR/Eve, Engineering/Alice, Engineering/Bob]
.thenComparing(salary, Comparator.reverseOrder()) → [Engineering/Alice, Engineering/Bob, HR/Eve, Sales/Diana, Sales/Charlie]
```

The first line has departments running **Sales → HR → Engineering** — descending. `.reversed()` flipped the department key too, not just the salary. The second keeps departments ascending and reverses only salary, which is almost always what was intended.

The three-key version at the top of this answer gives the same (correct) result as the second line:

```output
[Engineering/Alice, Engineering/Bob, HR/Eve, Sales/Diana, Sales/Charlie]
```

That distinction is the single most-asked sorting gotcha.

### Q: Sort with `null` values in the field?

```java
Comparator<Employee> nullSafe = Comparator.comparing(
    Employee::name,
    Comparator.nullsFirst(Comparator.naturalOrder()));

// Or handle null *elements* (not just null fields)
List<Employee> withNulls = ...;
withNulls.sort(Comparator.nullsLast(Comparator.comparing(Employee::name)));
```

### Q: Sort a `Map` by value, then by key — without collectors?

```java
Map<String, Integer> scores = new HashMap<>(Map.of("Alice", 90, "Bob", 95, "Eve", 90));

List<Map.Entry<String, Integer>> entries = new ArrayList<>(scores.entrySet());
entries.sort(Map.Entry.<String, Integer>comparingByValue().reversed()
             .thenComparing(Map.Entry.comparingByKey()));

LinkedHashMap<String, Integer> ordered = new LinkedHashMap<>();
for (var e : entries) ordered.put(e.getKey(), e.getValue());
```

#### Output

```output
raw HashMap          → {Bob=95, Eve=90, Alice=90}
sorted LinkedHashMap → {Bob=95, Alice=90, Eve=90}
```

Alice and Eve both scored 90, and the `thenComparing(comparingByKey())` breaks the tie alphabetically — without it their relative order would just be whatever the `HashMap` happened to yield.

Swap the `LinkedHashMap` for a `HashMap` and all that work is discarded:

```output
into a HashMap → {Bob=95, Eve=90, Alice=90}
```

Back to the original scrambled order.

`LinkedHashMap` is essential — putting into a `HashMap` throws the order away immediately.

### Q: Sort arrays?

```java
int[] nums = {5, 2, 9, 1};
Arrays.sort(nums);                       // ascending, primitives only
Arrays.sort(nums, 1, 3);                 // sort a range [1, 3)

Integer[] boxed = {5, 2, 9, 1};
Arrays.sort(boxed, Comparator.reverseOrder());   // descending needs boxed types

String[] names = {"Bob", "alice", "Eve"};
Arrays.sort(names, String.CASE_INSENSITIVE_ORDER);

// Parallel sort for large arrays (uses the common ForkJoinPool)
Arrays.parallelSort(nums);
```

#### Output

```output
Arrays.sort(nums)                         → [1, 2, 5, 9]
Arrays.sort({5,2,9,1}, 1, 3)              → [5, 2, 9, 1]
Arrays.sort(boxed, reverseOrder())        → [9, 5, 2, 1]
Arrays.sort(names, CASE_INSENSITIVE_ORDER) → [alice, Bob, Eve]
```

The range sort looks like it did nothing — it sorted indices 1 and 2 only, which held `2, 9`, already in order. Elements 0 and 3 are deliberately untouched. Note the bounds are `[from, to)`, exclusive at the top.

The case-insensitive result is worth comparing against the default:

```output
Arrays.sort(names)  → [Bob, Eve, alice]
```

Lowercase `alice` sorts *after* `Eve` by default, because `String.compareTo` compares UTF-16 code units and every uppercase letter is numerically below every lowercase one.

**There is no way to sort an `int[]` descending directly** — either sort ascending and reverse, or box it. That's a favourite trick question.

```java
int[] desc = Arrays.stream(nums).boxed()
    .sorted(Comparator.reverseOrder())
    .mapToInt(Integer::intValue)
    .toArray();
```

```output
[9, 5, 2, 1]
```

The reason is that `Arrays.sort(int[], Comparator)` does not exist — a `Comparator` works on objects, and `int` is not one. Boxing is the price.

### Q: How do you keep a collection permanently sorted instead of re-sorting?

```java
TreeSet<Employee> bySalary = new TreeSet<>(
    Comparator.comparingDouble(Employee::salary).thenComparing(Employee::id));
bySalary.addAll(employees);
bySalary.first(); bySalary.last(); bySalary.headSet(...);

TreeMap<String, Employee> byName = new TreeMap<>();

// Or a heap when you only ever need the extreme
PriorityQueue<Employee> pq = new PriorityQueue<>(Comparator.comparingDouble(Employee::salary));
```

O(log n) per insert beats O(n log n) per re-sort when reads are interleaved with writes. A `PriorityQueue` is *not* sorted for iteration — only `poll()` order is.

### Q: Top 3 earners — `sorted().limit(3)` or a heap?

```java
// Simple: O(n log n), sorts everything
List<Employee> top3 = employees.stream()
    .sorted(Comparator.comparingDouble(Employee::salary).reversed())
    .limit(3)
    .toList();

// Scales: O(n log k), holds only k elements
PriorityQueue<Employee> heap = new PriorityQueue<>(Comparator.comparingDouble(Employee::salary));
for (Employee e : employees) {
    heap.offer(e);
    if (heap.size() > 3) heap.poll();
}
```

For small n, `sorted().limit()` is fine and clearer. For a large or streaming source, the bounded heap is the right answer — and note that `sorted()` is a **stateful** stream operation that must buffer the entire stream, so it can't run on an infinite one.

---

## Sorting With Collectors

The key idea: **`Collectors` don't sort.** `toList()`, `toMap()`, and `groupingBy()` make no ordering promise on their own. You either sort *before* collecting, collect into a sorted structure, or post-process with `collectingAndThen`.

### Q: `stream().sorted().collect(toList())` — is the order preserved?

Yes, for a sequential stream: `Collectors.toList()` accumulates in encounter order, and `sorted()` establishes that order. Same for `toCollection(ArrayList::new)` and `joining()`.

It is **not** preserved by `toSet()`, `toMap()` (a `HashMap`), or `groupingBy()` (also a `HashMap`) — those hash their keys and discard encounter order:

```java
// Order is LOST — HashSet doesn't keep it
Set<String> s = employees.stream()
    .sorted(Comparator.comparing(Employee::name))
    .map(Employee::name)
    .collect(Collectors.toSet());

// Order is KEPT
Set<String> ordered = employees.stream()
    .sorted(Comparator.comparing(Employee::name))
    .map(Employee::name)
    .collect(Collectors.toCollection(LinkedHashSet::new));
```

#### Output

```output
toSet()                          → [Diana, Bob, Eve, Alice, Charlie]
toCollection(LinkedHashSet::new) → [Alice, Bob, Charlie, Diana, Eve]
```

Both pipelines called `sorted()` with the same comparator. The first threw that work away the moment it hit `toSet()`, because a `HashSet` has no notion of order. It is not that the sort failed — it is that the destination cannot store the result.

### Q: Collect into a sorted set/map with a custom order?

```java
// Sorted set, natural order
TreeSet<String> names = employees.stream().map(Employee::name)
    .collect(Collectors.toCollection(TreeSet::new));

// Sorted set, custom order — the supplier carries the comparator
TreeSet<Employee> bySalaryDesc = employees.stream()
    .collect(Collectors.toCollection(() -> new TreeSet<>(
        Comparator.comparingDouble(Employee::salary).reversed()
                  .thenComparing(Employee::id))));

// Sorted map via the 4-arg toMap
TreeMap<String, Double> salaryByName = employees.stream()
    .collect(Collectors.toMap(Employee::name, Employee::salary, Double::sum, TreeMap::new));

// Sorted map with a custom key order
TreeMap<String, Double> desc = employees.stream()
    .collect(Collectors.toMap(Employee::name, Employee::salary, Double::sum,
             () -> new TreeMap<>(Comparator.reverseOrder())));
```

#### Output

```output
names          → [Alice, Bob, Charlie, Diana, Eve]
bySalaryDesc   → [Alice, Bob, Diana, Charlie, Eve]
salaryByName   → {Alice=120000.0, Bob=95000.0, Charlie=80000.0, Diana=85000.0, Eve=70000.0}
desc           → {Eve=70000.0, Diana=85000.0, Charlie=80000.0, Bob=95000.0, Alice=120000.0}
```

`salaryByName` is keyed alphabetically; `desc` is the same data with the key comparator reversed. Note the **values** in `desc` look unsorted — only the keys are ordered, which is the whole contract of a sorted map.

When you use `TreeSet`, `sorted()` upstream is redundant — drop it.

### Q: Sort a map by value using collectors?

```java
LinkedHashMap<String, Integer> sorted = scores.entrySet().stream()
    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
    .collect(Collectors.toMap(
        Map.Entry::getKey,
        Map.Entry::getValue,
        (a, b) -> a,             // merge fn — required by the 4-arg overload
        LinkedHashMap::new));    // THE critical argument
```

Two things interviewers listen for: the explicit `LinkedHashMap::new` (without it you get a `HashMap` and lose the sort), and the fact that the merge function is unreachable here but still required by the signature.

The `<String, Integer>` witness on `Map.Entry.comparingByValue()` is needed because `.reversed()` breaks type inference — a very common compile error.

### Q: `groupingBy` — how do you sort the group *keys*?

Pass a map factory. `groupingBy` returns a `HashMap` otherwise.

#### Output

```output
plain groupingBy   → {Engineering=[Alice, Bob], Sales=[Charlie, Diana], HR=[Eve]}
byDept (TreeMap)   → {Engineering=[Alice, Bob], HR=[Eve], Sales=[Charlie, Diana]}
byDeptDesc         → {Sales=[Charlie, Diana], HR=[Eve], Engineering=[Alice, Bob]}
```

The plain version puts HR last; the `TreeMap` version puts it between Engineering and Sales where it belongs alphabetically.

```java
TreeMap<String, List<Employee>> byDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept, TreeMap::new, Collectors.toList()));

// Descending keys
TreeMap<String, List<Employee>> byDeptDesc = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             () -> new TreeMap<>(Comparator.reverseOrder()),
             Collectors.toList()));
```

### Q: `groupingBy` — how do you sort the values *inside* each group?

Two approaches, and knowing both is the point of the question.

**1. Sort upstream** — works because `groupingBy`'s downstream `toList()` preserves encounter order:

```java
Map<String, List<Employee>> sortedWithin = employees.stream()
    .sorted(Comparator.comparingDouble(Employee::salary).reversed())
    .collect(Collectors.groupingBy(Employee::dept));
```

```output
{Engineering=[Alice, Bob], Sales=[Diana, Charlie], HR=[Eve]}
```

Within Sales, Diana (85k) now precedes Charlie (80k) — the upstream sort survived into the groups. The **keys** are still in `HashMap` order, though; sorting upstream orders the values only.

Cheap and correct for a sequential stream (one sort of n elements), but it relies on an ordering guarantee that's easy to overlook, and it breaks if the downstream is `toSet()`.

**2. Sort in the finisher** with `collectingAndThen` — explicit and downstream-independent:

```java
Map<String, List<Employee>> sortedWithin = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.collectingAndThen(
                 Collectors.toList(),
                 list -> {
                     list.sort(Comparator.comparingDouble(Employee::salary).reversed());
                     return list;
                 })));
```

**Or collect each group straight into a sorted set:**

```java
Map<String, TreeSet<Employee>> byDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.toCollection(() -> new TreeSet<>(
                 Comparator.comparingDouble(Employee::salary).reversed()
                           .thenComparing(Employee::id)))));
```

### Q: Both at once — sorted keys *and* sorted values, names only?

```java
TreeMap<String, List<String>> result = employees.stream()
    .collect(Collectors.groupingBy(
        Employee::dept,
        TreeMap::new,
        Collectors.collectingAndThen(
            Collectors.mapping(Employee::name, Collectors.toList()),
            names -> { names.sort(null); return List.copyOf(names); })));
```

#### Output

```output
{Engineering=[Alice, Bob], HR=[Eve], Sales=[Charlie, Diana]}
```

Keys alphabetical (the `TreeMap::new` factory), values alphabetical (the finisher's `sort(null)`), and the values are immutable `List.copyOf` snapshots. `sort(null)` means "natural order" — it is not a no-op.

### Q: Top earner per department — with collectors?

```java
// maxBy → Optional
Map<String, Optional<Employee>> top = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.maxBy(Comparator.comparingDouble(Employee::salary))));

// Unwrapped
Map<String, Employee> topClean = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.collectingAndThen(
                 Collectors.maxBy(Comparator.comparingDouble(Employee::salary)),
                 Optional::get)));

// Just the name
Map<String, String> topName = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.collectingAndThen(
                 Collectors.maxBy(Comparator.comparingDouble(Employee::salary)),
                 opt -> opt.map(Employee::name).orElse("n/a"))));

// Without any collector at all — toMap with a max merge
Map<String, Employee> viaToMap = employees.stream()
    .collect(Collectors.toMap(Employee::dept, e -> e,
             BinaryOperator.maxBy(Comparator.comparingDouble(Employee::salary))));
```

#### Output

```output
top       → {Engineering=Optional[Alice], Sales=Optional[Diana], HR=Optional[Eve]}
topClean  → {Engineering=Alice, Sales=Diana, HR=Eve}
topName   → {Engineering=Alice, Sales=Diana, HR=Eve}
viaToMap  → {Engineering=Alice, Sales=Diana, HR=Eve}
```

All four agree; they differ only in how much ceremony reaches the caller. `viaToMap` is the leanest — no grouping, no `Optional`, just a merge function that keeps the larger of each colliding pair.

`Optional::get` inside `collectingAndThen` is safe here specifically because `groupingBy` never creates an empty group.

### Q: Departments ordered by total salary descending?

Sort a *derived* aggregate — group first, then sort the resulting entries.

```java
LinkedHashMap<String, Double> ranked = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.summingDouble(Employee::salary)))
    .entrySet().stream()
    .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
    .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue,
             (a, b) -> a, LinkedHashMap::new));
```

#### Output

```output
{Engineering=215000.0, Sales=165000.0, HR=70000.0}
```

Engineering 215k, Sales 165k, HR 70k — descending by total, held in insertion order by the `LinkedHashMap`.

You cannot sort by the aggregate in one pass — the aggregate doesn't exist until the group is complete. Two stages is the correct answer.

### Q: Top 2 per department, using a custom collector?

The composable version of the bounded-heap trick — see **Custom Collectors** for the `topN` implementation:

```java
Map<String, List<Employee>> top2 = employees.stream()
    .collect(Collectors.groupingBy(Employee::dept,
             topN(2, Comparator.comparingDouble(Employee::salary))));
```

### Q: Sorted, comma-joined names per department?

```java
Map<String, String> namesByDept = employees.stream()
    .sorted(Comparator.comparing(Employee::name))
    .collect(Collectors.groupingBy(Employee::dept,
             Collectors.mapping(Employee::name, Collectors.joining(", "))));
```

#### Output

```output
{Engineering=Alice, Bob, Sales=Charlie, Diana, HR=Eve}
```

That output is genuinely ambiguous to read — the `", "` separator inside each value and the `", "` between map entries are indistinguishable. It says Engineering → `"Alice, Bob"`, Sales → `"Charlie, Diana"`, HR → `"Eve"`. Worth remembering when you are eyeballing a joined map in a log: use `joining(", ", "[", "]")` to bracket each value.

`joining` is one of the collectors that *does* honour encounter order, so sorting upstream is sufficient and there's no list to post-sort.

---

## With vs Without — Summary

| Task | Without collectors | With collectors |
|------|-------------------|-----------------|
| Sort a list in place | `list.sort(cmp)` | — (collectors never mutate the source) |
| Sorted copy | `stream().sorted(cmp).toList()` | `collect(toList())` after `sorted` |
| Sorted unique | `new TreeSet<>(cmp)` + `addAll` | `collect(toCollection(() -> new TreeSet<>(cmp)))` |
| Sorted map by key | `new TreeMap<>(existing)` | `toMap(k, v, merge, TreeMap::new)` |
| Sorted map by value | sort `entrySet` into a `LinkedHashMap` | `sorted(comparingByValue()).collect(toMap(..., LinkedHashMap::new))` |
| Keep sorted as you insert | `TreeSet` / `TreeMap` / `PriorityQueue` | — |
| Group with sorted keys | manual `TreeMap` + `computeIfAbsent` | `groupingBy(fn, TreeMap::new, toList())` |
| Group with sorted values | `computeIfAbsent` then sort each list | `groupingBy(fn, collectingAndThen(toList(), sort))` |
| Top k | bounded `PriorityQueue` | custom `topN` collector |
| Max per key | loop with `merge` | `groupingBy(fn, maxBy(cmp))` |

The manual grouping equivalent, for comparison:

```java
Map<String, List<Employee>> byDept = new TreeMap<>();
for (Employee e : employees) {
    byDept.computeIfAbsent(e.dept(), k -> new ArrayList<>()).add(e);
}
byDept.values().forEach(l -> l.sort(Comparator.comparingDouble(Employee::salary).reversed()));
```

Interviewers often ask you to write this after the stream version — it demonstrates you understand what `groupingBy` is actually doing.

---

## Gotchas Worth Memorising

### Q: Why does `List.of(3, 1, 2).sort(null)` throw?

`List.of` returns an immutable list; `sort` mutates. Same for `Collections.unmodifiableList`, `List.copyOf`, and `Stream.toList()`. `Arrays.asList` *is* sortable (fixed size, mutable slots) but `add`/`remove` throw.

```output
List.of(3, 1, 2).sort(null)     → java.lang.UnsupportedOperationException
Arrays.asList(3, 1, 2).sort(null) → [1, 2, 3]
Arrays.asList(3, 1, 2).add(4)   → java.lang.UnsupportedOperationException
```

The middle line is the one people get wrong in interviews. `Arrays.asList` is *fixed-size*, not immutable — you can reorder and replace its elements, you just cannot change how many there are.

### Q: Does `sorted()` on a parallel stream preserve stability?

Yes — `Stream.sorted` is documented as stable for ordered streams, parallel or not. But if you call `unordered()` (or the source is inherently unordered, like a `HashSet`), stability is lost. Also, `forEach` on a parallel stream does **not** visit in sorted order; use `forEachOrdered`:

```java
employees.parallelStream()
    .sorted(Comparator.comparing(Employee::name))
    .forEach(System.out::println);          // arbitrary order!

employees.parallelStream()
    .sorted(Comparator.comparing(Employee::name))
    .forEachOrdered(System.out::println);   // sorted order
```

### Q: `sorted().findFirst()` vs `min()`?

`min(cmp)` is O(n) and allocates nothing; `sorted(cmp).findFirst()` sorts the whole stream first. Same for `max` vs `sorted(cmp.reversed()).findFirst()`. Always prefer `min`/`max`.

### Q: Why does `Map.Entry.comparingByValue().reversed()` fail to compile?

Because `reversed()` is invoked on the result of a generic method with nothing to infer from — the compiler has no target type at that point.

```java
// Fails: cannot infer the type argument
map.entrySet().stream().sorted(Map.Entry.comparingByValue().reversed());

// Fixes — pick one
map.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed());
Comparator<Map.Entry<String, Integer>> cmp = Map.Entry.comparingByValue();
map.entrySet().stream().sorted(cmp.reversed());
```

For primitives, use the specialised factories to avoid boxing: `comparingInt`, `comparingLong`, `comparingDouble`, and `thenComparingInt` / `thenComparingLong` / `thenComparingDouble`.

### Q: How do you sort strings the way a user expects?

`String.compareTo` is lexicographic by UTF-16 code unit — so `"Z" < "a"`, and accented characters sort after `z`. For human-facing order use a `Collator`:

```java
Collator collator = Collator.getInstance(Locale.FRENCH);
names.sort(collator);

// Or case-insensitive ASCII
names.sort(String.CASE_INSENSITIVE_ORDER);
names.sort(Comparator.comparing(String::toLowerCase));   // allocates; prefer the above
```

#### Input

```java
List<String> names = List.of("zebra", "eclair", "Ecole", "apple");
```

#### Output

```output
Collections.sort(names)                  → [Ecole, apple, eclair, zebra]
names.sort(Collator.getInstance(FRENCH)) → [apple, eclair, Ecole, zebra]
```

The default sort puts `Ecole` **first**, ahead of `apple` — because `E` is code unit 69 and `a` is 97. No user expects that. The `Collator` produces the order a French (or English) reader would.

The underlying comparison, made concrete:

```java
System.out.println("Z".compareTo("a"));
```

```output
-7
```

Negative, so `"Z"` sorts before `"a"`. Note the value is `-7`, not `-1` — `compareTo` returns the actual code-unit difference, which is another reason never to test a comparator result against a specific number.

### Q: What breaks when a comparator reads mutable state?

Everything. If a field used by the comparator changes during the sort, TimSort's invariants break and you get `IllegalArgumentException: Comparison method violates its general contract!` — or, worse, a silently mis-sorted list. Comparators must be pure functions of immutable state; never sort a collection while another thread mutates its elements.
