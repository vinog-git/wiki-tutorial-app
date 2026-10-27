# Java Collections Deep Dive

The basics live in **[Collections](/Java/Collections)**. This page covers what interviewers actually probe: the interface hierarchy, how each implementation stores data, complexity, and the traps.

---

## The Hierarchy

```
Iterable
  └── Collection
        ├── List      → ArrayList, LinkedList, Vector, CopyOnWriteArrayList
        ├── Set       → HashSet, LinkedHashSet, TreeSet, EnumSet
        └── Queue     → ArrayDeque, PriorityQueue, LinkedList
              └── Deque → ArrayDeque, LinkedList

Map (NOT a Collection)
  ├── HashMap → LinkedHashMap
  ├── TreeMap        (implements SortedMap / NavigableMap)
  ├── Hashtable
  ├── ConcurrentHashMap
  └── EnumMap
```

Two names that get confused constantly:

| Name | What it is |
|------|-----------|
| `Collection` | The root **interface** for List/Set/Queue |
| `Collections` | A **utility class** of `static` helpers (`sort`, `reverse`, `unmodifiableList`) |
| `Collector` | An **interface** describing a reduction strategy for `stream().collect(...)` |
| `Collectors` | A **utility class** of ready-made `Collector` factories (`toList`, `groupingBy`) |

`Map` is deliberately **not** a `Collection` — a collection holds elements, a map holds *mappings*. That's why `Map` has no `iterator()`; you iterate one of its three views: `keySet()`, `values()`, `entrySet()`.

---

## How the Main Implementations Store Data

### ArrayList

A single `Object[]` with a `size` counter. Growth is `newCapacity = oldCapacity + (oldCapacity >> 1)` — i.e. **1.5×** — then `Arrays.copyOf`.

```java
List<String> list = new ArrayList<>(100);  // pre-size when you know the count
```

Pre-sizing matters: growing from 10 to 10,000 elements costs ~20 array copies. `ensureCapacity` / the constructor argument skips all of them.

### LinkedList

A doubly-linked list of `Node` objects, each holding `item`, `next`, `prev`. Every element costs an extra object header + two references — roughly 40 bytes of overhead per element on a 64-bit JVM. It also implements `Deque`.

In practice, **`ArrayList` beats `LinkedList` almost always**, even for middle inserts, because `System.arraycopy` is a fast bulk memory move while `LinkedList` must first *traverse* to the index. `LinkedList` only wins when you insert/remove at the ends or via an existing `ListIterator`.

### HashMap

An array of buckets (`Node[] table`, always a power of two). Placement:

```
index = (n - 1) & (h ^ (h >>> 16))    // h = key.hashCode()
```

The `h ^ (h >>> 16)` spreads high bits down so they influence the low-bit index. Collisions chain in a linked list; **since Java 8, a bucket with 8+ entries converts to a red-black tree** (`TREEIFY_THRESHOLD = 8`), turning worst-case lookup from O(n) into O(log n). It untreeifies back to a list at 6 entries.

Default capacity 16, load factor 0.75 → resizes (doubles + rehashes) when size exceeds 12.

```java
// Avoid resizes: capacity = expectedSize / 0.75 + 1
Map<String, Integer> m = new HashMap<>(1_000_000 / 3 * 4);
```

### TreeMap

A red-black tree ordered by `compareTo` (or a supplied `Comparator`). O(log n) for everything, but gives you `NavigableMap`:

```java
TreeMap<Integer, String> tm = new TreeMap<>();
tm.firstKey(); tm.lastKey();
tm.floorKey(50);        // greatest key ≤ 50
tm.ceilingKey(50);      // smallest key ≥ 50
tm.headMap(50);         // keys < 50
tm.tailMap(50, true);   // keys ≥ 50
tm.subMap(10, true, 50, false);
tm.descendingMap();
```

#### Input

```java
TreeMap<Integer, String> tm = new TreeMap<>();
for (int i = 10; i <= 90; i += 20) tm.put(i, "v" + i);   // keys 10, 30, 50, 70, 90
```

#### Output

```output
{10=v10, 30=v30, 50=v50, 70=v70, 90=v90}
firstKey=10   lastKey=90
floorKey(50)=50    ceilingKey(50)=50
floorKey(55)=50    ceilingKey(55)=70
headMap(50)={10=v10, 30=v30}
tailMap(50, true)={50=v50, 70=v70, 90=v90}
subMap(10, true, 50, false)={10=v10, 30=v30}
descendingMap()={90=v90, 70=v70, 50=v50, 30=v30, 10=v10}
```

The `floorKey`/`ceilingKey` pair is the reason to reach for `TreeMap`: **the key need not exist**. `floorKey(55)` returns 50 and `ceilingKey(55)` returns 70, even though 55 is not in the map — that is a range query a `HashMap` simply cannot answer. When the key *does* exist, as with 50, both return it.

Note `headMap(50)` excludes 50 while `tailMap(50, true)` includes it. The default is inclusive-low, exclusive-high, same as `subList`.

`TreeMap` uses **`compareTo`, not `equals`**, to decide key identity — a subtle source of "lost" entries when the two disagree.

### LinkedHashMap

`HashMap` plus a doubly-linked list threading all entries in insertion order. Pass `accessOrder = true` and override `removeEldestEntry` and you have an LRU cache in six lines:

```java
class LRUCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    LRUCache(int capacity) {
        super(capacity, 0.75f, true);   // true = access order
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity;
    }
}
```

#### Try it

```java
LRUCache<String, Integer> cache = new LRUCache<>(3);
cache.put("a", 1);
cache.put("b", 2);
cache.put("c", 3);
System.out.println(cache);

cache.get("a");            // touching "a" makes it most-recently-used
System.out.println(cache);

cache.put("d", 4);         // over capacity — evict the least-recently-used
System.out.println(cache);
```

```output
{a=1, b=2, c=3}
{b=2, c=3, a=1}
{c=3, a=1, d=4}
```

Watch the middle line: a plain `get("a")` **reordered the map**, moving `a` to the end. That is `accessOrder = true` doing its job.

Then adding `d` evicted `b` — not `a`, even though `a` was inserted first, because `a` had just been read. With `accessOrder = false` (the default) the `get` would change nothing and `a` would have been the one evicted.

### ArrayDeque vs PriorityQueue

`ArrayDeque` is a circular array — the correct choice for both stacks and queues (`Stack` and `LinkedList` are legacy/slower). `PriorityQueue` is a binary min-heap: `offer`/`poll` are O(log n), `peek` is O(1), but **iteration order is not sorted** — only `poll()` order is.

```java
Deque<Integer> stack = new ArrayDeque<>();
stack.push(1); stack.push(2);
stack.pop();  // 2 — LIFO

Queue<Integer> q = new ArrayDeque<>();
q.offer(1); q.offer(2);
q.poll();     // 1 — FIFO

// Top-3 salaries with a bounded min-heap
PriorityQueue<Employee> top3 = new PriorityQueue<>(Comparator.comparingDouble(Employee::getSalary));
for (Employee e : employees) {
    top3.offer(e);
    if (top3.size() > 3) top3.poll();   // evict the smallest
}
```

#### Output

```output
stack=[2, 1]   pop=2
queue=[1, 2]   poll=1
```

`ArrayDeque` backs both: `push`/`pop` work on the front for LIFO, `offer`/`poll` add at the back and take from the front for FIFO.

The `PriorityQueue` caveat is worth seeing directly. Building one from `[5, 1, 4, 2, 3]`:

```java
PriorityQueue<Integer> pq = new PriorityQueue<>(List.of(5, 1, 4, 2, 3));
System.out.println(pq);                     // printing = iteration order
while (!pq.isEmpty()) System.out.print(pq.poll() + " ");
```

```output
[1, 2, 4, 5, 3]
1 2 3 4 5
```

**Printing a `PriorityQueue` does not show sorted order** — `[1, 2, 4, 5, 3]` is the raw heap array. Only `poll()` is ordered. The single guarantee is that the head is the minimum; everything below it is merely heap-ordered. Printing one in a log and concluding the queue is broken is a classic wasted afternoon.

The same applies to the top-3 heap, which ends up holding the three highest salaries in heap order:

```output
[Diana:85000.0, Alice:120000.0, Bob:95000.0]
```

Those *are* the top three — the smallest of them (Diana) is simply at the head, ready to be evicted if a bigger salary arrives.

---

## Complexity Cheat Sheet

| Operation | ArrayList | LinkedList | HashMap | TreeMap | HashSet | TreeSet | ArrayDeque |
|-----------|-----------|------------|---------|---------|---------|---------|------------|
| get by index | **O(1)** | O(n) | — | — | — | — | — |
| get by key | — | — | **O(1)**\* | O(log n) | — | — | — |
| add / put | O(1) amortized | **O(1)** at ends | **O(1)**\* | O(log n) | **O(1)**\* | O(log n) | **O(1)** amortized |
| remove by value | O(n) | O(n) | **O(1)**\* | O(log n) | **O(1)**\* | O(log n) | O(n) |
| contains | O(n) | O(n) | **O(1)**\* | O(log n) | **O(1)**\* | O(log n) | O(n) |
| ordered iteration | insertion | insertion | none | **sorted** | none | **sorted** | insertion |

\* O(1) average; O(log n) worst case since Java 8 treeification (was O(n)).

---

## equals / hashCode — the Contract That Breaks Maps

Any object used as a `HashMap` key or `HashSet` element must honour: **equal objects must have equal hash codes**.

```java
public class Employee {
    private final int id;
    private final String name;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Employee other)) return false;
        return id == other.id && Objects.equals(name, other.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name);   // must use the same fields as equals
    }
}
```

Break it and things silently misbehave:

```java
Set<Employee> set = new HashSet<>();
set.add(new Employee(1, "Alice"));
set.contains(new Employee(1, "Alice"));  // false if hashCode() is not overridden
```

#### Output

```output
false
```

`equals` says the two objects are equal, but without `hashCode` they land in different buckets, so `contains` never even gets to the `equals` check. The object is in the set — `size()` is 1 and iteration will show it — yet it cannot be found.

With a `record`, which generates both methods from the same components:

```java
Set<EmployeeKey> set = new HashSet<>();
set.add(new EmployeeKey(1, "Alice"));
System.out.println(set.contains(new EmployeeKey(1, "Alice")));
```

```output
true
```

**Mutable keys are worse.** Mutate a field used in `hashCode` after insertion and the entry is stranded in the wrong bucket — unreachable by `get`, still counted in `size()`, still visible in iteration. Prefer immutable keys, or a `record`, which generates a correct `equals`/`hashCode`/`toString` for you:

```java
record EmployeeKey(int id, String name) { }   // equals + hashCode for free
```

---

## Fail-Fast Iteration and ConcurrentModificationException

Most `java.util` collections keep a `modCount`. The iterator snapshots it and throws `ConcurrentModificationException` if it changes underneath.

```java
// Throws CME
for (String s : list) {
    if (s.startsWith("A")) list.remove(s);
}

// Correct: Iterator.remove()
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    if (it.next().startsWith("A")) it.remove();
}

// Correct and shorter (Java 8+)
list.removeIf(s -> s.startsWith("A"));

// Maps: mutate values safely during iteration
map.entrySet().removeIf(e -> e.getValue() < 10);
map.replaceAll((k, v) -> v * 2);
```

#### Input

```java
List<String> list = new ArrayList<>(List.of("Alice", "Bob", "Anna"));
```

#### Output

```output
Exception in thread "main" java.util.ConcurrentModificationException
	at java.base/java.util.ArrayList$Itr.checkForComodification(ArrayList.java:1013)
	at java.base/java.util.ArrayList$Itr.next(ArrayList.java:967)
```

Note *where* it throws: on the **next** call to `next()`, not on `remove`. The removal succeeds, and the failure surfaces one iteration later — which is why the stack trace points at the loop rather than the line that caused the problem.

Each of the correct versions gives:

```output
Iterator.remove()  → [Bob]
removeIf(...)      → [Bob]
```

And for maps, starting from `{a=5, b=15}`:

```output
entrySet().removeIf(e -> e.getValue() < 10)  → {b=15}
replaceAll((k, v) -> v * 2)                  → {b=30}
```

Note this is *fail-fast*, best-effort detection, not a guarantee — never rely on CME for correctness in concurrent code.

---

## Views Are Live, Not Copies

`subList`, `keySet`, `values`, `entrySet`, and `Arrays.asList` return **views backed by the original**.

```java
List<Integer> sub = list.subList(0, 3);
sub.clear();                 // removes those 3 elements from `list` too

Map<String, Integer> map = new HashMap<>();
map.keySet().remove("Alice");   // removes the whole entry from the map

List<String> fixed = Arrays.asList("a", "b");
fixed.set(0, "z");   // OK — writes through to the array
fixed.add("c");      // UnsupportedOperationException — fixed size
```

#### Output

Starting from `list = [1, 2, 3, 4, 5]` and `map = {Alice=1, Bob=2}`:

```output
after sub.clear()        → list is [4, 5]
after keySet().remove()  → map is {Bob=2}
after fixed.set(0, "z")  → [z, b]
fixed.add("c")           → java.lang.UnsupportedOperationException
```

The first line is the one that surprises people: `sub.clear()` was called on the sub-list, but three elements vanished from `list`. A view holds no data of its own — every read and write goes straight through to the backing collection.

`Arrays.asList` is a view onto the **array**, which is why `set` works (the array has a slot to write) but `add` does not (an array cannot grow).

To get an independent copy: `new ArrayList<>(list.subList(0, 3))`.

---

## Immutable Collections (Java 9+)

```java
List<String> l = List.of("a", "b", "c");
Set<String>  s = Set.of("a", "b");
Map<String, Integer> m = Map.of("a", 1, "b", 2);
Map<String, Integer> big = Map.ofEntries(
    Map.entry("a", 1),
    Map.entry("b", 2)
);

List<String> copy = List.copyOf(existing);   // immutable snapshot
```

Differences from `Collections.unmodifiableList(...)`:

| | `List.of` | `Collections.unmodifiableList` |
|---|---|---|
| Backing data | own storage, truly immutable | a **view** — mutating the original shows through |
| `null` elements | rejected (`NullPointerException`) | allowed |
| Duplicates in `Set.of`/`Map.of` keys | `IllegalArgumentException` | n/a |

#### Output

All three restrictions, in order:

```output
List.of("a","b","c").add("d")  → java.lang.UnsupportedOperationException
List.of("a", null)             → java.lang.NullPointerException
Set.of("a", "a")               → java.lang.IllegalArgumentException: duplicate element: a
```

The last two fail at **construction**, not on use — a nice property, since the problem surfaces at the line that caused it. Note `Set.of` rejecting duplicates is the opposite of `new HashSet<>(List.of("a", "a"))`, which silently gives you a one-element set.

---

## Concurrent Collections

| Need | Use | Not |
|------|-----|-----|
| Concurrent map | `ConcurrentHashMap` | `Hashtable`, `synchronizedMap` |
| Sorted concurrent map | `ConcurrentSkipListMap` | `synchronizedSortedMap` |
| Read-heavy, rarely-written list | `CopyOnWriteArrayList` | `synchronizedList` |
| Producer/consumer handoff | `LinkedBlockingQueue`, `ArrayBlockingQueue` | `wait`/`notify` by hand |
| Unbounded high-throughput queue | `ConcurrentLinkedQueue` | |
| Scheduled/delayed work | `DelayQueue`, `PriorityBlockingQueue` | |

`ConcurrentHashMap` locks per-bin (CAS on the first node, `synchronized` on the bin head), so unrelated keys never contend. Its atomic composites are the point:

```java
ConcurrentHashMap<String, Integer> counts = new ConcurrentHashMap<>();
counts.merge("hits", 1, Integer::sum);            // atomic increment
counts.computeIfAbsent("key", k -> expensive(k)); // computed at most once
counts.putIfAbsent("key", 0);
```

#### Output

```output
counts.merge("hits", 1, Integer::sum)  ×2   → {hits=2}
counts.computeIfAbsent("key", ...)          → {hits=2, key=99}
counts.putIfAbsent("key", 0)                → {hits=2, key=99}   (unchanged)
```

`putIfAbsent` did nothing because `key` was already present — that is the point of it. And `merge` is a genuine atomic increment: `map.put(k, map.get(k) + 1)` across threads is a read-modify-write race, while `merge` is not.

Storing a `null` is rejected outright:

```output
counts.put("x", null)  → java.lang.NullPointerException
```

Two important properties: its iterators are **weakly consistent** (no `ConcurrentModificationException`, but they may or may not reflect concurrent writes), and `size()` is an estimate, not a lock-free-exact count. Also, `ConcurrentHashMap` forbids `null` keys and values — `get` returning `null` unambiguously means "absent".

---

## Choosing an Implementation

```
Need key → value?
  ├── need sorted keys / range queries  → TreeMap
  ├── need insertion or access order    → LinkedHashMap
  ├── keys are enum constants           → EnumMap
  ├── concurrent access                 → ConcurrentHashMap
  └── otherwise                         → HashMap

Need uniqueness only?
  ├── sorted        → TreeSet
  ├── insertion order → LinkedHashSet
  ├── enum values   → EnumSet
  └── otherwise     → HashSet

Need an ordered sequence?
  ├── index access, iteration           → ArrayList
  ├── heavy add/remove at both ends     → ArrayDeque
  ├── always pull the min/max next      → PriorityQueue
  ├── read-mostly and shared            → CopyOnWriteArrayList
  └── blocking handoff between threads  → BlockingQueue
```

---

## The `Collections` Utility Class

```java
Collections.sort(list);
Collections.sort(list, comparator);
Collections.reverse(list);
Collections.shuffle(list);
Collections.swap(list, 0, 1);
Collections.max(list);  Collections.min(list);
Collections.frequency(list, "Alice");
Collections.nCopies(3, "x");             // [x, x, x] immutable
Collections.disjoint(list1, list2);      // true if no elements in common
Collections.addAll(list, "a", "b", "c");
Collections.fill(list, "x");
Collections.rotate(list, 2);
Collections.binarySearch(sortedList, key);   // list MUST be sorted
Collections.unmodifiableList(list);
Collections.synchronizedList(list);
Collections.emptyList();
Collections.reverseOrder();              // a descending Comparator
```

#### Input

```java
List<String> list = new ArrayList<>(List.of("b", "a", "c", "a"));
```

#### Output

```output
frequency(list, "a")       → 2
max(list) / min(list)      → c / a
nCopies(3, "x")            → [x, x, x]
disjoint(list, ["z"])      → true
reverse(list)              → [a, c, a, b]
rotate(list, 2)            → [a, b, a, c]
```

`binarySearch` is the one with a trap. On a sorted `[10, 20, 30, 40]`:

```output
binarySearch(list, 30)  → 2
binarySearch(list, 35)  → -4
```

A **negative** result means "not found", and it is not just `-1`: the value is `-(insertionPoint) - 1`. Here `-4` means 35 would belong at index 3. That is deliberately useful — `-result - 1` gives you the index to insert at to keep the list sorted — but it means `if (binarySearch(...) >= 0)` is the only correct way to test for presence.

The other trap: the list **must already be sorted**. On an unsorted list `binarySearch` does not fail — it silently returns a meaningless answer.
