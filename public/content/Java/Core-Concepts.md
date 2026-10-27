# Core Java Fundamentals

## Variables and Data Types

Java has two kinds of types: **primitive types** (built-in, stored by value) and **reference types** (objects, stored by reference).

### Primitive Types

```java
public class CoreJavaBasics {
    public static void main(String[] args) {
        // Primitive types
        int age = 25;
        double salary = 50000.50;
        boolean isActive = true;
        char grade = 'A';

        // Strings (objects)
        String name = "John";
        String message = new String("Hello");
    }
}
```

| Type | Example | Description |
|------|---------|-------------|
| `int` | `int age = 25;` | Whole numbers |
| `double` | `double salary = 50000.50;` | Decimal numbers |
| `boolean` | `boolean isActive = true;` | true or false |
| `char` | `char grade = 'A';` | Single character |
| `String` | `String name = "John";` | Text (reference type) |

#### Try it

Declaring a variable prints nothing on its own. Add `System.out.println` to see the values:

```java
public class CoreJavaBasics {
    public static void main(String[] args) {
        int age = 25;
        double salary = 50000.50;
        boolean isActive = true;
        char grade = 'A';
        String name = "John";

        System.out.println(name + " is " + age + " years old");
        System.out.println("Salary: " + salary);
        System.out.println("Grade: " + grade + ", active: " + isActive);
    }
}
```

```output
John is 25 years old
Salary: 50000.5
Grade: A, active: true
```

Notice that `50000.50` prints as `50000.5` — a `double` stores a number, not the digits you typed, so the trailing zero is not preserved. Use `String.format("%.2f", salary)` when you need exactly two decimal places.

## Operators

Java supports arithmetic, comparison, and logical operators.

```java
int a = 10, b = 3;
System.out.println(a + b);      // 13
System.out.println(a - b);      // 7
System.out.println(a * b);      // 30
System.out.println(a / b);      // 3 (integer division)
System.out.println(a % b);      // 1 (remainder)
System.out.println(a > b);      // true
System.out.println(a == b);     // false
```

#### Output

With `a = 10` and `b = 3`, the console shows:

```output
13
7
30
3
1
true
false
```

Note that dividing two `int` values performs integer division — the decimal portion is discarded. To keep it, make one side a `double`:

```java
System.out.println(a / b);              // 3
System.out.println((double) a / b);     // 3.3333333333333335
```

```output
3
3.3333333333333335
```

## Arrays

Arrays store multiple values of the same type.

```java
// Single-dimensional array
int[] numbers = {1, 2, 3, 4, 5};
String[] names = new String[5];

// Multidimensional array
int[][] matrix = {{1, 2}, {3, 4}};
```

- `{1, 2, 3, 4, 5}` initialises with values
- `new String[5]` creates an array of 5 nulls, filled later
- `matrix[0][1]` accesses row 0, column 1 → `2`

#### Try it

```java
import java.util.Arrays;

public class ArrayDemo {
    public static void main(String[] args) {
        int[] numbers = {1, 2, 3, 4, 5};
        String[] names = new String[5];
        int[][] matrix = {{1, 2}, {3, 4}};

        System.out.println(numbers[0]);                 // first element
        System.out.println(numbers[numbers.length - 1]); // last element
        System.out.println(numbers.length);             // size, not an index
        System.out.println(names[0]);                   // never assigned
        System.out.println(matrix[0][1]);               // row 0, column 1
        System.out.println(Arrays.toString(numbers));   // readable printing
    }
}
```

```output
1
5
5
null
2
[1, 2, 3, 4, 5]
```

Printing an array directly gives you something like `[I@4617c264` — the type and hash code, not the contents. That is why the last line uses `Arrays.toString`.

#### Out-of-bounds access

Valid indices run from `0` to `length - 1`. Anything else throws at runtime:

```java
int[] numbers = {1, 2, 3, 4, 5};
System.out.println(numbers[5]);
```

```output
Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 5 out of bounds for length 5
	at ArrayDemo.main(ArrayDemo.java:2)
```

## Control Flow

### If-Else

```java
if (age >= 18) {
    System.out.println("Adult");
} else if (age >= 13) {
    System.out.println("Teenager");
} else {
    System.out.println("Child");
}
```

Conditions are evaluated top to bottom; the first matching branch runs.

#### Input

```java
int age = 15;
```

#### Output

```output
Teenager
```

Only one branch ever runs. `15 >= 18` is false, so Java tries the next condition, `15 >= 13`, which is true — and the `else` block is skipped entirely.

| Input | Output | Why |
|-------|--------|-----|
| `age = 20` | `Adult` | First condition matches |
| `age = 18` | `Adult` | `>=` includes the boundary |
| `age = 15` | `Teenager` | First fails, second matches |
| `age = 13` | `Teenager` | Boundary again |
| `age = 8` | `Child` | Neither matches, falls to `else` |

## Loops

### Standard For Loop

```java
for (int i = 0; i < 5; i++) {
    System.out.println(i);
}
```

#### Output

```output
0
1
2
3
4
```

The loop starts at `0` and stops **before** `5`, so it runs five times and never prints `5`. This is the standard way to walk an array, because indices also start at `0`.

### Enhanced For Loop (for-each)

Use this when you don't need the index.

```java
for (String name : names) {  // Enhanced for loop
    System.out.println(name);
}
```

#### Input

```java
String[] names = {"Alice", "Bob", "Charlie"};
```

#### Output

```output
Alice
Bob
Charlie
```

Careful: if the array came from `new String[3]` and was never filled, the same loop prints three `null` lines instead.

### While Loop

```java
while (count < 10) {
    count++;
}
```

#### Try it

The version above changes `count` but prints nothing. Add output to watch it run:

```java
int count = 0;

while (count < 3) {
    System.out.println("count = " + count);
    count++;
}

System.out.println("Loop ended, count = " + count);
```

```output
count = 0
count = 1
count = 2
Loop ended, count = 3
```

The body never runs with `count` equal to `3` — the condition is checked *before* each pass, so the loop exits as soon as `count < 3` becomes false.

### Do-While Loop

Runs the body **at least once**, then checks the condition.

```java
do {
    System.out.println("At least once");
} while (false);
```

#### Try it

Putting a `while` and a `do-while` side by side with the same false condition shows the difference:

```java
int n = 10;

do {
    System.out.println("do-while body ran, n = " + n);
} while (n < 5);

while (n < 5) {
    System.out.println("while body ran, n = " + n);
}
```

```output
do-while body ran, n = 10
```

`n < 5` is false from the start. The `do-while` still runs once because its condition is checked *after* the body; the plain `while` checks first and never runs at all.

---

## Quick Reference Summary

### Collections

| Class | Ordered | Unique | Sorted |
|-------|---------|--------|--------|
| `ArrayList` | ✓ | ✗ | ✗ |
| `HashMap` | ✗ | Key unique | ✗ |
| `HashSet` | ✗ | ✓ | ✗ |
| `TreeMap` | ✓ | Key unique | ✓ |
| `LinkedHashMap` | ✓ (Insert) | Key unique | ✗ |

#### Try it

```java
import java.util.*;

List<String> list = new ArrayList<>(List.of("b", "a", "b"));
Set<String> set = new HashSet<>(List.of("b", "a", "b"));
Map<String, Integer> tree = new TreeMap<>(Map.of("b", 2, "a", 1));

System.out.println(list);   // keeps order, keeps duplicates
System.out.println(set);    // drops the duplicate "b"
System.out.println(tree);   // sorted by key
```

```output
[b, a, b]
[a, b]
{a=1, b=2}
```

### Streams Pipeline

```
Source (list, array, range)
     ↓
Intermediate (filter, map, flatMap, sort)
     ↓
Terminal (collect, forEach, reduce, count)
```

#### Try it

One pipeline with each stage labelled:

```java
import java.util.*;
import java.util.stream.*;

List<String> names = List.of("Alice", "Bob", "Charlie", "Dave", "Eve");

List<String> result = names.stream()        // Source
    .filter(n -> n.length() > 3)            // Intermediate: keeps Alice, Charlie, Dave
    .map(String::toUpperCase)               // Intermediate: ALICE, CHARLIE, DAVE
    .sorted()                               // Intermediate: alphabetical
    .collect(Collectors.toList());          // Terminal: builds the list

System.out.println(result);
```

```output
[ALICE, CHARLIE, DAVE]
```

`Bob` and `Eve` are three letters long, so `filter` drops them. Nothing actually executes until the terminal operation runs — remove the `collect` line and the stream produces no output at all.

### Collectors Common Methods

| Method | Purpose |
|--------|---------|
| `groupingBy()` | GROUP BY — produces `Map<Key, List<V>>` |
| `counting()` | COUNT items |
| `joining()` | Concatenate strings |
| `maxBy/minBy()` | Find MAX/MIN |
| `partitioningBy()` | Split into two groups (true/false) |
| `summingInt/averagingInt()` | SUM / AVG |

#### Try it

The same input list through four different collectors:

```java
import java.util.*;
import java.util.stream.*;

List<String> names = List.of("Alice", "Bob", "Charlie", "Dave", "Eve");

System.out.println(names.stream()
    .collect(Collectors.groupingBy(String::length)));

System.out.println(names.stream()
    .collect(Collectors.counting()));

System.out.println(names.stream()
    .collect(Collectors.joining(", ")));

System.out.println(names.stream()
    .collect(Collectors.partitioningBy(n -> n.length() > 3)));
```

```output
{3=[Bob, Eve], 4=[Dave], 5=[Alice], 7=[Charlie]}
5
Alice, Bob, Charlie, Dave, Eve
{false=[Bob, Eve], true=[Alice, Charlie, Dave]}
```

`groupingBy` returns a `HashMap`, so key order is the map's internal bucket order, not a promise. It looks sorted here only because small `Integer` keys happen to land in ascending buckets — use `groupingBy(String::length, TreeMap::new, toList())` when you actually need sorted keys.

### Exception Types

| Type | When | Examples |
|------|------|---------|
| **Checked** | Compile-time — must handle or declare | `IOException`, `SQLException` |
| **Unchecked** | Runtime — programming errors | `NullPointerException`, `ArrayIndexOutOfBoundsException` |
| **Error** | Serious JVM problems | `OutOfMemoryError`, `StackOverflowError` |

#### Try it

An unchecked exception compiles fine and fails at runtime:

```java
String name = null;
System.out.println("Length: " + name.length());
```

```output
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.length()" because "name" is null
	at Demo.main(Demo.java:2)
```

A checked exception will not compile at all until you handle or declare it:

```java
import java.nio.file.*;

public class Demo {
    public static void main(String[] args) {
        String text = Files.readString(Path.of("missing.txt"));
    }
}
```

```output
Demo.java:5: error: unreported exception IOException; must be caught or declared to be thrown
        String text = Files.readString(Path.of("missing.txt"));
                                      ^
1 error
```

That is the whole distinction: the compiler forces you to deal with checked exceptions, and trusts you to avoid unchecked ones.
