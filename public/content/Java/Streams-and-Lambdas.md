# Java Streams and Lambdas

## What are Lambdas?

Before Java 8, passing behaviour required anonymous inner classes — verbose and hard to read. **Lambda expressions** let you write a function inline as a value. They work with **functional interfaces** (interfaces with exactly one abstract method).

### Before and After

```java
// Before Java 8 (verbose)
Comparator<String> comp1 = new Comparator<String>() {
    @Override
    public int compare(String s1, String s2) {
        return s1.compareTo(s2);
    }
};

// Java 8+ (lambda)
Comparator<String> comp2 = (s1, s2) -> s1.compareTo(s2);

// Lambda with multiple statements
Comparator<Integer> comp3 = (a, b) -> {
    System.out.println("Comparing...");
    return Integer.compare(a, b);
};
```

#### Try it

All three do the same job; only the syntax shrinks.

```java
System.out.println(comp2.compare("apple", "banana"));
System.out.println(comp3.compare(3, 5));
```

```output
-1
Comparing...
-1
```

`compareTo` and `Integer.compare` return a **negative number, zero, or a positive number** — not `true`/`false`. Here `-1` means "the first argument sorts before the second". Only the sign matters; never test a comparator's result with `== -1`.

---

## Functional Interfaces

A functional interface has exactly one abstract method. You can define your own or use the built-in ones from `java.util.function`.

### Custom Functional Interface

```java
@FunctionalInterface
public interface Calculator {
    int calculate(int a, int b);

    // Can have default/static methods
    default void show() {
        System.out.println("Calculating...");
    }
}

Calculator add = (a, b) -> a + b;
Calculator multiply = (a, b) -> a * b;

System.out.println(add.calculate(5, 10));       // 15
System.out.println(multiply.calculate(5, 10)); // 50
```

#### Output

```output
15
50
```

One interface, two completely different behaviours, decided at the call site. Calling the `default` method works too:

```java
add.show();
```

```output
Calculating...
```

A `@FunctionalInterface` may have any number of `default` and `static` methods — only the count of *abstract* methods must be exactly one.

### Built-in Functional Interfaces

```java
// Predicate<T>  — takes T, returns boolean
Predicate<Integer> isPositive = x -> x > 0;

// Function<T, R>  — takes T, returns R
Function<String, Integer> length = s -> s.length();

// Consumer<T>  — takes T, returns void
Consumer<String> print = s -> System.out.println(s);

// Supplier<T>  — takes nothing, returns T
Supplier<String> greet = () -> "Hello";
```

#### Try it

Each one is invoked through its own method name — that's the part people forget:

```java
System.out.println(isPositive.test(-5));      // Predicate  → test
System.out.println(length.apply("streams"));  // Function   → apply
System.out.println(greet.get());              // Supplier   → get
print.accept("consumed");                     // Consumer   → accept
```

```output
false
7
Hello
consumed
```

| Interface | Method | Takes | Returns |
|-----------|--------|-------|---------|
| `Predicate<T>` | `test` | `T` | `boolean` |
| `Function<T,R>` | `apply` | `T` | `R` |
| `Consumer<T>` | `accept` | `T` | nothing |
| `Supplier<T>` | `get` | nothing | `T` |

---

## The Stream API

A **Stream** is a pipeline for processing a sequence of elements. Streams don't store data — they process it lazily, operation by operation.

```
STREAM PIPELINE:
┌──────────────────────────────────────────────┐
│ Source (list, array, range)                  │
│      ↓                                        │
│ Intermediate (filter, map, flatMap, sort)    │
│      ↓                                        │
│ Terminal (collect, forEach, reduce, count)   │
└──────────────────────────────────────────────┘
```

---

## Intermediate Operations

Intermediate operations return a new Stream. They are lazy — nothing runs until a terminal operation is called.

### filter — keep matching elements

```java
List<Integer> numbers = Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

List<Integer> evenNumbers = numbers.stream()
    .filter(n -> n % 2 == 0)
    .toList();  // [2, 4, 6, 8, 10]
```

#### Output

```output
[2, 4, 6, 8, 10]
```

Ten elements in, five out — `filter` changes the size but never the type.

### map — transform each element

```java
// Square each number
List<Integer> squared = numbers.stream()
    .map(n -> n * n)
    .toList();  // [1, 4, 9, 16, 25, ...]

// Convert strings to uppercase
List<String> words = Arrays.asList("hello", "world", "java");
List<String> uppercase = words.stream()
    .map(String::toUpperCase)
    .toList();  // [HELLO, WORLD, JAVA]
```

#### Output

```output
[1, 4, 9, 16, 25, 36, 49, 64, 81, 100]
[HELLO, WORLD, JAVA]
```

Ten in, ten out — `map` is the mirror image of `filter`: the size never changes, but the type can.

### flatMap — flatten nested structures

```java
List<List<Integer>> nested = Arrays.asList(
    Arrays.asList(1, 2),
    Arrays.asList(3, 4),
    Arrays.asList(5, 6)
);
List<Integer> flattened = nested.stream()
    .flatMap(list -> list.stream())
    .toList();  // [1, 2, 3, 4, 5, 6]
```

#### Input

```java
[[1, 2], [3, 4], [5, 6]]
```

#### Output

```output
[1, 2, 3, 4, 5, 6]
```

Three lists of two become one list of six. Using `map` here would give you `[[1, 2], [3, 4], [5, 6]]` back — a `Stream<List<Integer>>` rather than a `Stream<Integer>`.

### Chaining Multiple Operations

```java
List<Integer> result = numbers.stream()
    .filter(n -> n % 2 == 0)  // keep even
    .map(n -> n * n)           // square them
    .filter(n -> n > 10)       // keep > 10
    .limit(3)                  // take first 3
    .toList();
// [16, 36, 64]
```

#### Output

```output
[16, 36, 64]
```

Following the numbers `1..10` through each stage:

| Stage | Result |
|-------|--------|
| source | `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]` |
| `filter(n % 2 == 0)` | `[2, 4, 6, 8, 10]` |
| `map(n * n)` | `[4, 16, 36, 64, 100]` |
| `filter(n > 10)` | `[16, 36, 64, 100]` |
| `limit(3)` | `[16, 36, 64]` |

Because streams are lazy, `100` is never actually squared-and-tested: `limit(3)` stops pulling elements once it has three, so the pipeline short-circuits.

---

## Terminal Operations

Terminal operations trigger the pipeline and produce a result.

### forEach

```java
numbers.stream()
    .filter(n -> n > 5)
    .forEach(n -> System.out.println(n));  // 6, 7, 8, 9, 10
```

```output
6
7
8
9
10
```

`forEach` prints one element per line — it returns `void`, so it must be the last thing in the chain.

### findFirst

```java
Optional<Integer> first = numbers.stream()
    .filter(n -> n > 5)
    .findFirst();
// first.ifPresent(System.out::println);  // 6
```

```output
Optional[6]
```

Printing the `Optional` itself shows the wrapper. `findFirst` returns `Optional` because the filter might match nothing — `ifPresent` or `orElse` unwraps it.

### Match operations

```java
boolean hasEven    = numbers.stream().anyMatch(n -> n % 2 == 0);  // true
boolean allPositive = numbers.stream().allMatch(n -> n > 0);       // true
boolean noneNegative = numbers.stream().noneMatch(n -> n < 0);     // true
```

```output
true
true
true
```

All three short-circuit: `anyMatch` stops at the first match, `allMatch` and `noneMatch` stop at the first counter-example. On an **empty** stream the answers flip in a way that surprises people — `anyMatch` is `false`, but `allMatch` and `noneMatch` are both `true`.

---

## Collectors

Collectors are terminal operations that gather stream elements into a result container.

```java
List<String> fruits = Arrays.asList("apple", "banana", "cherry", "date", "elderberry");

// toList / toSet
List<String> list = fruits.stream()
    .filter(f -> f.length() > 4)
    .collect(Collectors.toList());

Set<String> set = fruits.stream()
    .collect(Collectors.toSet());

// joining — concatenate into a string
String joined = fruits.stream()
    .collect(Collectors.joining(", "));  // "apple, banana, cherry, date, elderberry"

// counting
long count = fruits.stream()
    .collect(Collectors.counting());  // 5

// maxBy / minBy
Optional<String> longest = fruits.stream()
    .collect(Collectors.maxBy(Comparator.comparing(String::length)));
// "elderberry"

// averagingInt / summingInt
List<Integer> nums = Arrays.asList(10, 20, 30, 40, 50);
double average = nums.stream()
    .collect(Collectors.averagingInt(Integer::intValue));  // 30.0

int sum = nums.stream()
    .collect(Collectors.summingInt(Integer::intValue));  // 150
```

#### Output

```output
list     → [apple, banana, cherry, elderberry]
set      → [banana, date, apple, cherry, elderberry]
joined   → apple, banana, cherry, date, elderberry
count    → 5
longest  → Optional[elderberry]
average  → 30.0
sum      → 150
```

`date` is four letters, so `filter(f -> f.length() > 4)` drops it from `list`. And notice `set` comes back in a scrambled order — a `HashSet` has no ordering, which is the price of its `O(1)` lookups.

### groupingBy — like SQL GROUP BY

```java
// Group fruits by their string length
Map<Integer, List<String>> byLength = fruits.stream()
    .collect(Collectors.groupingBy(String::length));
// {4: [date], 5: [apple], 6: [banana, cherry], 10: [elderberry]}

// Count within each group
Map<Integer, Long> lengthCount = fruits.stream()
    .collect(Collectors.groupingBy(String::length, Collectors.counting()));
// {4: 1, 5: 1, 6: 2, 10: 1}
```

#### Output

```output
{4=[date], 5=[apple], 6=[banana, cherry], 10=[elderberry]}
{4=1, 5=1, 6=2, 10=1}
```

`banana` and `cherry` are both six letters, so they share a key. Adding `Collectors.counting()` swaps each list for its size — and note the counts are `Long`, not `int`.

### partitioningBy — split into two groups

```java
Map<Boolean, List<String>> byLength5 = fruits.stream()
    .collect(Collectors.partitioningBy(f -> f.length() > 5));
// true:  [banana, cherry, elderberry]
// false: [apple, date]
```

#### Output

```output
{false=[apple, date], true=[banana, cherry, elderberry]}
```

`false` prints first: `partitioningBy` returns a fixed two-entry map, not a `HashMap`. Both keys are always present, so `get(true)` never returns `null` even when nothing matches.

---

## Practical Example: Student Grade System

Grouping and aggregating real data with streams and collectors.

```java
List<Student> students = Arrays.asList(
    new Student("Alice", "CS", 3.9),
    new Student("Bob", "CS", 3.7),
    new Student("Charlie", "Math", 3.8),
    new Student("Diana", "Math", 3.5),
    new Student("Eve", "Physics", 3.9)
);

// Group students by major
Map<String, List<Student>> byMajor = students.stream()
    .collect(Collectors.groupingBy(Student::getMajor));

// Count students per major
Map<String, Long> countByMajor = students.stream()
    .collect(Collectors.groupingBy(Student::getMajor, Collectors.counting()));

// Average GPA per major
Map<String, Double> avgGpaByMajor = students.stream()
    .collect(Collectors.groupingBy(
        Student::getMajor,
        Collectors.averagingDouble(Student::getGpa)
    ));

// Top student from each major
Map<String, Optional<Student>> topByMajor = students.stream()
    .collect(Collectors.groupingBy(
        Student::getMajor,
        Collectors.maxBy(Comparator.comparingDouble(Student::getGpa))
    ));

// Partition into high GPA (3.8+) and lower GPA
Map<Boolean, List<Student>> byGpa = students.stream()
    .collect(Collectors.partitioningBy(s -> s.getGpa() >= 3.8));

System.out.println("High GPA (3.8+): " + byGpa.get(true));
System.out.println("Low GPA: " + byGpa.get(false));
```

#### Output

```output
High GPA (3.8+): [Alice (CS) - GPA: 3.9, Charlie (Math) - GPA: 3.8, Eve (Physics) - GPA: 3.9]
Low GPA: [Bob (CS) - GPA: 3.7, Diana (Math) - GPA: 3.5]
```

The other four collectors in that snippet produce:

```output
byMajor        → {CS=[Alice, Bob], Math=[Charlie, Diana], Physics=[Eve]}
countByMajor   → {CS=2, Math=2, Physics=1}
avgGpaByMajor  → {CS=3.8, Math=3.65, Physics=3.9}
topByMajor     → {CS=Optional[Alice], Math=Optional[Charlie], Physics=Optional[Eve]}
```

(The `Student` values are shown by name only; each is really the full `toString`.) Charlie's 3.8 lands in the high group because `>=` includes the boundary.

---

## Practical Example: Word Frequency Analyzer

```java
public class WordAnalyzer {
    // Count frequency of each word
    public static Map<String, Integer> analyzeWords(String text) {
        return Arrays.stream(text.toLowerCase().split("\\s+"))
            .filter(word -> !word.isEmpty())
            .collect(Collectors.groupingBy(
                String::toString,
                Collectors.summingInt(w -> 1)
            ));
    }

    // Top N most frequent words
    public static List<Map.Entry<String, Integer>> topWords(String text, int n) {
        return analyzeWords(text)
            .entrySet()
            .stream()
            .sorted((e1, e2) -> e2.getValue().compareTo(e1.getValue()))
            .limit(n)
            .toList();
    }

    // Frequency of each character
    public static Map<Character, Long> characterFrequency(String text) {
        return text.toLowerCase()
            .chars()
            .filter(c -> c != ' ')
            .boxed()
            .map(c -> (char) c.intValue())
            .collect(Collectors.groupingBy(Character::charValue, Collectors.counting()));
    }
}

// Usage
String text = "java is great java programming is fun java is powerful";
System.out.println("Word Frequency: " + WordAnalyzer.analyzeWords(text));
System.out.println("Top 3 Words: " + WordAnalyzer.topWords(text, 3));
System.out.println("Character Frequency: " + WordAnalyzer.characterFrequency(text));
```

#### Input

```java
String text = "java is great java programming is fun java is powerful";
```

#### Output

```output
Word Frequency: {java=3, powerful=1, is=3, great=1, fun=1, programming=1}
Top 3 Words: [java=3, is=3, powerful=1]
Character Frequency: {a=8, e=2, f=2, g=3, i=4, j=3, l=1, m=2, n=2, o=2, p=2, r=4, s=3, t=1, u=2, v=3, w=1}
```

Two things to be careful about here:

- **Word Frequency is not sorted.** It's a `HashMap`, so `powerful` appears second despite occurring once. Collect into a `TreeMap` if you want alphabetical keys.
- **Top 3 Words has an arbitrary third entry.** `java` and `is` both occur three times, but `great`, `fun`, `programming` and `powerful` are all tied on one — which of them lands in third place depends on map order, not on the data. A stable tie-break needs a second sort key, e.g. `.sorted(Map.Entry.<String,Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))`.

Character Frequency *is* sorted, but only by luck: `Character` keys are small numbers that happen to land in ascending `HashMap` buckets.

### Character Frequency — Two Approaches

```java
// Simple loop approach
public static void findCharFrequency(String str) {
    Map<Character, Integer> freq = new LinkedHashMap<>();
    for (char c : str.toCharArray()) {
        if (c != ' ') {
            freq.put(c, freq.getOrDefault(c, 0) + 1);
        }
    }
    freq.forEach((ch, count) -> System.out.println(ch + ": " + count));
}

// Find the most frequent character
public static char mostFrequentChar(String str) {
    return str.chars()
        .filter(c -> c != ' ')
        .boxed()
        .collect(Collectors.groupingBy(c -> (char) c.intValue(), Collectors.counting()))
        .entrySet()
        .stream()
        .max((e1, e2) -> e1.getValue().compareTo(e2.getValue()))
        .map(Map.Entry::getKey)
        .orElse('\0');
}

// Usage
String str = "programming";
findCharFrequency(str);
System.out.println("Most frequent: " + mostFrequentChar(str));
```

#### Output

```output
p: 1
r: 2
o: 1
g: 2
a: 1
m: 2
i: 1
n: 1
Most frequent: r
```

The loop version uses a `LinkedHashMap`, so characters print in **first-seen order** — `p, r, o, g, a, m, i, n` — which is usually what you want when displaying a frequency table.

`Most frequent: r` deserves a warning: `r`, `g` and `m` all appear twice. With a three-way tie, `max` returns whichever the map happened to yield first, so this answer is stable for a given JDK but is not something the code actually guarantees. If ties matter, decide the rule explicitly rather than letting `HashMap` decide for you.

---

## Collectors Quick Reference

| Collector | SQL Equivalent | Returns |
|-----------|---------------|---------|
| `groupingBy()` | `GROUP BY` | `Map<K, List<V>>` |
| `counting()` | `COUNT(*)` | `Long` |
| `joining()` | string concat | `String` |
| `maxBy()` / `minBy()` | `MAX` / `MIN` | `Optional<T>` |
| `partitioningBy()` | — | `Map<Boolean, List<T>>` |
| `summingInt()` | `SUM` | `Integer` |
| `averagingInt()` | `AVG` | `Double` |

---

## Interview Questions

**What is the difference between `filter` and `map`?**
`filter` keeps or removes elements — the list size changes, the element type stays the same. `map` transforms each element into something else — the list size stays the same, but the type can change.

**How does `groupingBy` work?**
It creates a `Map<Key, List<Value>>` where all elements that produce the same key are grouped together — exactly like SQL's `GROUP BY`.

**What is the advantage of using lambdas?**
Less boilerplate: behaviour that used to require a named class or anonymous inner class can now be expressed in a single line. Code reads closer to intent.

**What are streams and why use them?**
Streams provide a declarative, functional way to process collections — filter, transform, aggregate — in a readable pipeline. They evaluate lazily, so intermediate steps only do work when the terminal operation runs.
