# Java Collections

## What are Collections?

The Java Collections Framework provides ready-made data structures for holding groups of objects. The main types are **List**, **Map**, and **Set** — each with different characteristics for ordering, uniqueness, and performance.

> Going further: **Collections Deep Dive** (internals, complexity, `equals`/`hashCode`, concurrent collections), **Collectors** (`groupingBy`, `toMap`, `teeing`), **Custom Collectors** (the `Collector` interface), and **Interview Questions: Sorting**.

---

## ArrayList

`ArrayList` is an ordered list that allows duplicates. Use it when you need fast random access by index.

```java
import java.util.*;

ArrayList<String> list = new ArrayList<>();
list.add("Apple");
list.add("Banana");
list.add("Cherry");

// Access by index
String first = list.get(0);  // "Apple"

// Iterate
for (String fruit : list) {
    System.out.println(fruit);
}

// Modify
list.set(0, "Apricot");      // replace at index 0
list.remove(1);              // remove by index
list.remove("Apricot");      // remove by value

// Utility
System.out.println(list.size());             // current size
System.out.println(list.contains("Banana")); // true/false
```

#### Output

```output
Apple
Banana
Cherry
1
false
```

The three fruit names come from the loop, which runs *before* the modifications. By the time `size()` is called the list has been whittled down to one element:

| Step | List afterwards |
|------|-----------------|
| after the three `add` calls | `[Apple, Banana, Cherry]` |
| `set(0, "Apricot")` | `[Apricot, Banana, Cherry]` |
| `remove(1)` — by **index** | `[Apricot, Cherry]` |
| `remove("Apricot")` — by **value** | `[Cherry]` |

That is also why `contains("Banana")` prints `false`: `remove(1)` removed Banana. Watch out for this overload — `remove(1)` deletes position 1, while `remove("1")` would look for the value.

---

## HashMap

`HashMap` stores key-value pairs. Keys are unique; values can repeat. Order is not guaranteed.

```java
HashMap<String, Integer> map = new HashMap<>();
map.put("Alice", 25);
map.put("Bob", 30);
map.put("Charlie", 35);

// Get a value
int age = map.get("Alice");  // 25

// Iterate over keys
for (String key : map.keySet()) {
    System.out.println(key);
}

// Iterate over values
for (Integer value : map.values()) {
    System.out.println(value);
}

// Iterate over key-value pairs
for (Map.Entry<String, Integer> entry : map.entrySet()) {
    System.out.println(entry.getKey() + ": " + entry.getValue());
}
```

#### Output

```output
25
Bob
Alice
Charlie
30
25
35
Bob: 30
Alice: 25
Charlie: 35
```

The keys were inserted Alice, Bob, Charlie but come back **Bob, Alice, Charlie**. A `HashMap` iterates in internal bucket order, which depends on each key's hash — not on insertion order and not alphabetically. Printing the map directly shows the same thing:

```java
System.out.println(map);
```

```output
{Bob=30, Alice=25, Charlie=35}
```

Never rely on this order. Use `LinkedHashMap` to keep insertion order, or `TreeMap` to sort by key.

---

## HashSet

`HashSet` stores unique elements only. Adding a duplicate has no effect.

```java
HashSet<String> set = new HashSet<>();
set.add("Apple");
set.add("Banana");
set.add("Apple");  // duplicate, not added

System.out.println(set.size());            // 2
System.out.println(set.contains("Apple")); // true
```

#### Output

```output
2
true
```

Adding `"Apple"` twice leaves the set unchanged. `add` returns a `boolean` telling you whether anything was inserted, which is a neat way to test for duplicates:

```java
System.out.println(set.add("Apple"));   // already present
System.out.println(set);
```

```output
false
[Apple, Banana]
```

---

## TreeMap (Sorted)

`TreeMap` is like `HashMap` but always iterates keys in **alphabetical (natural) order**.

```java
TreeMap<String, Integer> sortedMap = new TreeMap<>();
sortedMap.put("Charlie", 35);
sortedMap.put("Alice", 25);
sortedMap.put("Bob", 30);
// Iterates in alphabetical order: Alice, Bob, Charlie
```

#### Try it

```java
TreeMap<String, Integer> sortedMap = new TreeMap<>();
sortedMap.put("Charlie", 35);
sortedMap.put("Alice", 25);
sortedMap.put("Bob", 30);

System.out.println(sortedMap);
System.out.println(sortedMap.firstKey() + " / " + sortedMap.lastKey());
```

```output
{Alice=25, Bob=30, Charlie=35}
Alice / Charlie
```

Inserted Charlie first, but it comes out last — a `TreeMap` keeps its keys sorted at all times, which is what makes `firstKey()`, `lastKey()` and range queries like `headMap`/`tailMap` possible. The trade-off is `O(log n)` lookups instead of `HashMap`'s `O(1)`.

---

## Read-Only Collections

Wrap any collection to prevent modification.

```java
List<String> readOnly = Collections.unmodifiableList(list);
// readOnly.add("Date");  // throws UnsupportedOperationException

Map<String, Integer> readOnlyMap = Collections.unmodifiableMap(map);
Set<String> readOnlySet = Collections.unmodifiableSet(set);

// Convenience factories
List<String> singleItem = Collections.singletonList("Only");
List<String> empty = Collections.emptyList();
```

#### Try it

Uncommenting that `add` call gives you a runtime failure, not a compile error — the type is still `List`, so the compiler is happy:

```java
List<String> base = new ArrayList<>(List.of("Apple", "Banana"));
List<String> readOnly = Collections.unmodifiableList(base);

readOnly.add("Date");
```

```output
Exception in thread "main" java.lang.UnsupportedOperationException
	at java.base/java.util.Collections$UnmodifiableCollection.add(Collections.java:1093)
	at Demo.main(Demo.java:4)
```

One catch worth knowing: `unmodifiableList` returns a **view**, not a copy. Changing the original list still shows through:

```java
base.add("Cherry");
System.out.println(readOnly);
```

```output
[Apple, Banana, Cherry]
```

For a genuinely independent snapshot use `List.copyOf(base)`.

---

## Collections Summary

| Class | Ordered | Unique | Sorted |
|-------|---------|--------|--------|
| `ArrayList` | ✓ | ✗ | ✗ |
| `HashMap` | ✗ | Key unique | ✗ |
| `HashSet` | ✗ | ✓ | ✗ |
| `TreeMap` | ✓ | Key unique | ✓ |
| `LinkedHashMap` | ✓ (Insert) | Key unique | ✗ |

---

## Practical Example: Employee Sorting (Comparable & Comparator)

`Comparable` defines the **natural order** of a class. `Comparator` defines an **external, custom order**.

### Implementing Comparable

```java
public class Employee implements Comparable<Employee> {
    private int id;
    private String name;
    private double salary;

    public Employee(int id, String name, double salary) {
        this.id = id;
        this.name = name;
        this.salary = salary;
    }

    // Natural ordering by salary
    @Override
    public int compareTo(Employee other) {
        return Double.compare(this.salary, other.salary);
    }

    public int getId() { return id; }
    public String getName() { return name; }
    public double getSalary() { return salary; }

    @Override
    public String toString() {
        return name + " (ID: " + id + ", Salary: $" + salary + ")";
    }
}
```

### Implementing Comparator

```java
class EmployeeNameComparator implements Comparator<Employee> {
    @Override
    public int compare(Employee e1, Employee e2) {
        return e1.getName().compareTo(e2.getName());
    }
}
```

### Sorting in Practice

```java
List<Employee> employees = Arrays.asList(
    new Employee(1, "Alice", 50000),
    new Employee(2, "Charlie", 60000),
    new Employee(3, "Bob", 55000)
);

// Sort by salary (natural order via Comparable)
Collections.sort(employees);
System.out.println("By Salary: " + employees);

// Sort by name (custom Comparator)
Collections.sort(employees, new EmployeeNameComparator());
System.out.println("By Name: " + employees);

// Sort descending using lambda
employees.sort((e1, e2) -> Double.compare(e2.getSalary(), e1.getSalary()));
System.out.println("By Salary (Desc): " + employees);
```

#### Output

```output
By Salary: [Alice (ID: 1, Salary: $50000.0), Bob (ID: 3, Salary: $55000.0), Charlie (ID: 2, Salary: $60000.0)]
By Name: [Alice (ID: 1, Salary: $50000.0), Bob (ID: 3, Salary: $55000.0), Charlie (ID: 2, Salary: $60000.0)]
By Salary (Desc): [Charlie (ID: 2, Salary: $60000.0), Bob (ID: 3, Salary: $55000.0), Alice (ID: 1, Salary: $50000.0)]
```

The first two lines are identical here — with this data, salary order and name order happen to agree. Give Alice the highest salary and they diverge, which is exactly the point of having both `Comparable` and `Comparator`.

Note the salaries print as `$50000.0`: the field is a `double`, and `50000` becomes `50000.0`. Also note `Collections.sort(employees)` works even though `Arrays.asList` returns a **fixed-size** list — sorting replaces elements in place rather than adding or removing them. Calling `employees.add(...)` on that same list would throw `UnsupportedOperationException`.

---

## Practical Example: Library System (Collections + Streams)

This example combines a `List` of objects with Stream operations to search, group, and aggregate data.

```java
public class Book {
    private String title;
    private String author;
    private int year;
    private String genre;
    private double price;
    // constructor, getters...
}

public class Library {
    private List<Book> books = new ArrayList<>();

    public void addBook(Book book) {
        books.add(book);
    }

    // Find by author
    public List<Book> findByAuthor(String author) {
        return books.stream()
            .filter(b -> b.getAuthor().equalsIgnoreCase(author))
            .toList();
    }

    // Find by genre
    public List<Book> findByGenre(String genre) {
        return books.stream()
            .filter(b -> b.getGenre().equalsIgnoreCase(genre))
            .toList();
    }

    // Books within a price range
    public List<Book> findByPriceRange(double minPrice, double maxPrice) {
        return books.stream()
            .filter(b -> b.getPrice() >= minPrice && b.getPrice() <= maxPrice)
            .toList();
    }

    // Count books per genre
    public Map<String, Long> countByGenre() {
        return books.stream()
            .collect(Collectors.groupingBy(Book::getGenre, Collectors.counting()));
    }

    // Average price per author
    public Map<String, Double> averagePriceByAuthor() {
        return books.stream()
            .collect(Collectors.groupingBy(
                Book::getAuthor,
                Collectors.averagingDouble(Book::getPrice)
            ));
    }

    // Most expensive book
    public Optional<Book> getMostExpensiveBook() {
        return books.stream()
            .max(Comparator.comparingDouble(Book::getPrice));
    }
}
```

### Usage

```java
Library library = new Library();
library.addBook(new Book("Java Guide", "Alice", 2020, "Tech", 45.99));
library.addBook(new Book("Python Basics", "Bob", 2021, "Tech", 39.99));
library.addBook(new Book("Clean Code", "Charlie", 2018, "Tech", 55.99));
library.addBook(new Book("The Hobbit", "Tolkien", 1937, "Fantasy", 12.99));

System.out.println("Books by Tech Genre: " + library.findByGenre("Tech"));
System.out.println("Count by Genre: " + library.countByGenre());
System.out.println("Most Expensive: " + library.getMostExpensiveBook());
```

#### Output

Assuming `Book.toString()` returns `title + " by " + author + " ($" + price + ")"`:

```output
Books by Tech Genre: [Java Guide by Alice ($45.99), Python Basics by Bob ($39.99), Clean Code by Charlie ($55.99)]
Count by Genre: {Tech=3, Fantasy=1}
Most Expensive: Optional[Clean Code by Charlie ($55.99)]
```

Three things to notice:

- `countByGenre` returns `Map<String, Long>` — `Collectors.counting()` always counts as a `Long`, never an `int`.
- `getMostExpensiveBook` prints wrapped in `Optional[...]` because `max()` has nothing to return for an empty library. Call `.orElse(null)` or `.map(Book::getTitle)` to unwrap it.
- `averagePriceByAuthor()` on this data gives one entry per author, since no author appears twice:

```output
{Tolkien=12.99, Bob=39.99, Alice=45.99, Charlie=55.99}
```

---

## Practical Example: Student Grade System (groupingBy + Streams)

`groupingBy` works like SQL's `GROUP BY` — it partitions a stream into a `Map` keyed by a classifier function.

```java
public class Student {
    private String name;
    private String major;
    private double gpa;

    public Student(String name, String major, double gpa) {
        this.name = name;
        this.major = major;
        this.gpa = gpa;
    }

    public String getName() { return name; }
    public String getMajor() { return major; }
    public double getGpa() { return gpa; }

    @Override
    public String toString() {
        return name + " (" + major + ") - GPA: " + gpa;
    }
}
```

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
System.out.println("Students by Major: " + byMajor);

// Count students by major
Map<String, Long> countByMajor = students.stream()
    .collect(Collectors.groupingBy(
        Student::getMajor,
        Collectors.counting()
    ));
System.out.println("Count by Major: " + countByMajor);

// Average GPA by major
Map<String, Double> avgGpaByMajor = students.stream()
    .collect(Collectors.groupingBy(
        Student::getMajor,
        Collectors.averagingDouble(Student::getGpa)
    ));
System.out.println("Average GPA by Major: " + avgGpaByMajor);

// Top student from each major
Map<String, Optional<Student>> topByMajor = students.stream()
    .collect(Collectors.groupingBy(
        Student::getMajor,
        Collectors.maxBy(Comparator.comparingDouble(Student::getGpa))
    ));
System.out.println("Top Student by Major: " + topByMajor);

// Partition into high GPA (≥3.8) and low GPA
Map<Boolean, List<Student>> byGpa = students.stream()
    .collect(Collectors.partitioningBy(s -> s.getGpa() >= 3.8));
System.out.println("High GPA (3.8+): " + byGpa.get(true));
System.out.println("Low GPA: " + byGpa.get(false));
```

#### Output

```output
Students by Major: {CS=[Alice (CS) - GPA: 3.9, Bob (CS) - GPA: 3.7], Math=[Charlie (Math) - GPA: 3.8, Diana (Math) - GPA: 3.5], Physics=[Eve (Physics) - GPA: 3.9]}
Count by Major: {CS=2, Math=2, Physics=1}
Average GPA by Major: {CS=3.8, Math=3.65, Physics=3.9}
Top Student by Major: {CS=Optional[Alice (CS) - GPA: 3.9], Math=Optional[Charlie (Math) - GPA: 3.8], Physics=Optional[Eve (Physics) - GPA: 3.9]}
High GPA (3.8+): [Alice (CS) - GPA: 3.9, Charlie (Math) - GPA: 3.8, Eve (Physics) - GPA: 3.9]
Low GPA: [Bob (CS) - GPA: 3.7, Diana (Math) - GPA: 3.5]
```

Reading the results:

| Collector | Produces | Note |
|-----------|----------|------|
| `groupingBy(getMajor)` | `Map<String, List<Student>>` | Students keep their original stream order within each group |
| `groupingBy(..., counting())` | `Map<String, Long>` | The downstream collector replaces the list |
| `groupingBy(..., averagingDouble(...))` | `Map<String, Double>` | CS averages 3.9 and 3.7 to exactly 3.8 |
| `groupingBy(..., maxBy(...))` | `Map<String, Optional<Student>>` | `maxBy` wraps in `Optional` — use `collectingAndThen` to unwrap |
| `partitioningBy(...)` | `Map<Boolean, List<Student>>` | Always has both `true` and `false` keys, even when one side is empty |

`partitioningBy` is the one to reach for with a yes/no question — unlike `groupingBy(s -> s.getGpa() >= 3.8)`, it guarantees both keys exist, so `byGpa.get(true)` never returns `null`.
