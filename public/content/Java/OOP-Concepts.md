# Java OOP Concepts

## Method Overloading vs Method Overriding

Two of the most commonly confused OOP concepts in Java — both let you reuse method names, but they work at different times and serve different purposes.

### Method Overloading

Overloading means defining multiple methods in the **same class** with the **same name but different parameters** (different types, number, or order). The compiler picks the right one at compile-time.

```java
public class Calculator {
    public int add(int a, int b) { return a + b; }
    public double add(double a, double b) { return a + b; }
    public int add(int a, int b, int c) { return a + b + c; }
    public String add(String a, String b) { return a + " " + b; }
}

Calculator calc = new Calculator();
System.out.println(calc.add(5, 10));            // 15
System.out.println(calc.add(5.5, 10.5));        // 16.0
System.out.println(calc.add(5, 10, 15));        // 30
System.out.println(calc.add("Hello", "World")); // Hello World
```

#### Output

```output
15
16.0
30
Hello World
```

Four calls, four different methods — the compiler picks each one by looking at the argument types. `add(5.5, 10.5)` prints `16.0` rather than `16` because it resolved to the `double` version.

A subtle one: `calc.add(5, 10.5)` would also work, picking the `double` version and widening the `int` `5` to `5.0`. Overload resolution prefers an exact match, then widening, then boxing — which is why `add(5, 10)` chooses `int` and not `double`.

### Method Overriding

Overriding means a **subclass redefines a method from its parent class** using the exact same signature. Java decides which version to call at **runtime** based on the actual object type — this is called runtime polymorphism.

```java
public class Animal {
    public void sound() {
        System.out.println("Animal makes sound");
    }
}

public class Dog extends Animal {
    @Override
    public void sound() {
        System.out.println("Dog barks");
    }
}

public class Cat extends Animal {
    @Override
    public void sound() {
        System.out.println("Cat meows");
    }
}

Animal animal = new Dog();
animal.sound();  // "Dog barks" (runtime polymorphism)

Animal animal2 = new Cat();
animal2.sound();  // "Cat meows"
```

#### Output

```output
Dog barks
Cat meows
```

Neither line prints `Animal makes sound`. The **variable type** is `Animal`, but the **object** is a `Dog` or a `Cat`, and overriding is resolved by the object at runtime — the opposite of overloading, which the compiler settles in advance.

Even though the variable is declared as `Animal`, Java calls the overridden version in the actual object (`Dog` or `Cat`). This is the power of polymorphism.

### Comparison Table

| Aspect | Overloading | Overriding |
|--------|------------|------------|
| When resolved | Compile-time | Runtime |
| Scope | Same class | Parent-child classes |
| Parameters | Must differ | Must be same |
| Return type | Can differ | Must be same (or covariant) |
| Access modifier | Can differ | Must be >= parent's |

---

## Comparable vs Comparator

Both interfaces allow you to sort objects, but they differ in where the sorting logic lives and how flexible it is.

### Comparable — Natural Ordering

Implement `Comparable` directly **inside the class** to define its natural sort order. The `compareTo()` method returns a negative number, zero, or positive number to indicate less-than, equal, or greater-than.

```java
public class Student implements Comparable<Student> {
    String name;
    int marks;
    
    public Student(String name, int marks) {
        this.name = name;
        this.marks = marks;
    }
    
    @Override
    public int compareTo(Student other) {
        return Integer.compare(this.marks, other.marks);
        // For descending: return Integer.compare(other.marks, this.marks);
    }
}

List<Student> students = new ArrayList<>();
students.add(new Student("Alice", 85));
students.add(new Student("Bob", 75));
students.add(new Student("Charlie", 95));

Collections.sort(students);  // Uses compareTo()
// Result: Bob(75), Alice(85), Charlie(95)
```

#### Output

Assuming `Student.toString()` returns `name + "(" + marks + ")"`:

```output
[Bob(75), Alice(85), Charlie(95)]
```

`Collections.sort` never looks at the field names — it just calls `compareTo`, which compares `marks`. Swap the arguments in `Integer.compare` and the same call sorts descending.

### Comparator — Custom Ordering

`Comparator` defines a sort order **outside** the class, so `Student` itself never changes and you can have as many orders as you need. There are four ways to write one, starting with the classic style and moving to the shortest.

#### 1. Separate class (the classic way)

```java
public class StudentMarksComparator implements Comparator<Student> {
    @Override
    public int compare(Student s1, Student s2) {
        return Integer.compare(s1.marks, s2.marks);
    }
}

public class StudentNameComparator implements Comparator<Student> {
    @Override
    public int compare(Student s1, Student s2) {
        return s1.name.compareTo(s2.name);
    }
}

Collections.sort(students, new StudentMarksComparator());
Collections.sort(students, new StudentNameComparator());
```

#### Output

```output
by marks  → [Bob(75), Alice(85), Charlie(95)]
by name   → [Alice(85), Bob(75), Charlie(95)]
```

Same list, same objects, two different orders. Use this style when a comparator has a name of its own or is reused in many places.

#### 2. Lambda (Java 8+)

A lambda is the same comparator without the extra class:

```java
// Sort by name, A to Z
students.sort((s1, s2) -> s1.name.compareTo(s2.name));

// Sort by marks, highest first: swap the operands to reverse the order
students.sort((s1, s2) -> Integer.compare(s2.marks, s1.marks));
```

```output
[Alice(85), Bob(75), Charlie(95)]
[Charlie(95), Alice(85), Bob(75)]
```

#### 3. Comparator.comparing (the simplest)

`Comparator.comparing` takes a function that picks the field to sort by. Use `comparingInt` for `int` fields such as `marks`, which avoids boxing. Add `.reversed()` to flip the order.

```java
// Sort by name, A to Z
students.sort(Comparator.comparing((Student s) -> s.name));

// Sort by marks, highest first
students.sort(Comparator.comparingInt((Student s) -> s.marks).reversed());
```

```output
[Alice(85), Bob(75), Charlie(95)]
[Charlie(95), Alice(85), Bob(75)]
```

The `(Student s)` type is needed before `.reversed()`. Without it, Java cannot infer the type of `s` in the chain.

#### 4. Tie-breaking with thenComparing

Use `thenComparing` when the first field can be equal and you need a second field to decide the order:

```java
// Highest marks first; if two students have the same marks, sort those by name
students.sort(Comparator.comparingInt((Student s) -> s.marks)
                        .reversed()
                        .thenComparing(s -> s.name));
```

```output
[Charlie(95), Alice(85), Bob(75)]
```

Here no two students share marks, so the second key never runs. If Dave also had 85, he would appear after Alice, because the name breaks the tie.

#### 5. naturalOrder() and reverseOrder()

You don't always need to write a comparator. `Comparator.naturalOrder()` uses the element's own `compareTo()` (its `Comparable` order), and `Comparator.reverseOrder()` is the same order flipped. Strings, `Integer`, and any class that implements `Comparable` work with both.

```java
List<String> names = new ArrayList<>(List.of("Charlie", "Alice", "Bob"));

names.sort(Comparator.naturalOrder());  // A to Z
names.sort(Comparator.reverseOrder());  // Z to A
```

```output
[Alice, Bob, Charlie]
[Charlie, Bob, Alice]
```

`Student` implements `Comparable` by marks (see above), so the same two methods work on it directly:

```java
students.sort(Comparator.naturalOrder());  // marks, lowest first
students.sort(Comparator.reverseOrder());  // marks, highest first
```

```output
[Bob(75), Alice(85), Charlie(95)]
[Charlie(95), Alice(85), Bob(75)]
```

#### 6. Streams

Streams accept the same comparators in `sorted()`, `max()` and `min()`. The difference from `list.sort()` is that `sorted()` returns a new sorted stream and leaves the original list unchanged.

```java
// Sort a copy by name; students itself is not changed
List<Student> byName = students.stream()
        .sorted(Comparator.comparing((Student s) -> s.name))
        .toList();

// Sort names in reverse alphabetical order
List<String> reversedNames = Stream.of("Charlie", "Alice", "Bob")
        .sorted(Comparator.reverseOrder())
        .toList();
```

```output
[Alice(85), Bob(75), Charlie(95)]
[Charlie, Bob, Alice]
```

`max()` and `min()` return an `Optional`, which is useful for finding the top or lowest item:

```java
// Top scorer, using the Comparable order (marks)
Optional<Student> top = students.stream()
        .max(Comparator.naturalOrder());

// Lowest scorer, using a field comparator
Optional<Student> lowest = students.stream()
        .min(Comparator.comparingInt((Student s) -> s.marks));
```

```output
Optional[Charlie(95)]
Optional[Bob(75)]
```

Combine `sorted()` with `limit()` for a top-N list, and `map()` to pull out just the field you need:

```java
// Names of the two highest scorers
List<String> topTwo = students.stream()
        .sorted(Comparator.comparingInt((Student s) -> s.marks).reversed())
        .limit(2)
        .map(s -> s.name)
        .toList();
```

```output
[Charlie, Alice]
```

### Comparison Table

| Aspect | Comparable | Comparator |
|--------|-----------|-----------|
| Implementation | Inside the class | Separate class or lambda |
| Method | `compareTo()` | `compare()` |
| Natural order | Yes | No |
| Flexibility | One fixed order | Multiple orderings |
| Usage | `Collections.sort(list)` | `Collections.sort(list, comparator)` |

**Interview answer:** Use `Comparable` when the class has one obvious natural order. Use `Comparator` when you need multiple sort orders or cannot modify the class.

---

## Immutability

An immutable class cannot be changed after creation. `String` in Java is the classic example. To build your own:

1. Declare the class `final` (prevents subclassing)
2. Make all fields `final`
3. Provide no setters
4. Return **defensive copies** of any mutable fields

```java
public final class ImmutableUser {
    private final String name;
    private final int age;
    private final List<String> hobbies;
    
    public ImmutableUser(String name, int age, List<String> hobbies) {
        this.name = name;
        this.age = age;
        this.hobbies = new ArrayList<>(hobbies);  // Defensive copy
    }
    
    public String getName() { return name; }
    public int getAge() { return age; }
    
    public List<String> getHobbies() {
        return Collections.unmodifiableList(hobbies);  // Return defensive copy
    }
    
    // No setters!
}
```

The defensive copy in the constructor and getter ensures that modifying the original list does not affect the object:

```java
List<String> myHobbies = new ArrayList<>();
myHobbies.add("Reading");
ImmutableUser user = new ImmutableUser("Alice", 25, myHobbies);

myHobbies.add("Gaming");  // Doesn't affect user
System.out.println(user.getHobbies());  // ["Reading"]

// user.setName("Bob");  // No such method - compile error
```

#### Output

```output
[Reading]
```

`Gaming` was added to `myHobbies` *after* the user was constructed, and it does not show up — the constructor copied the list rather than storing the caller's reference. Without that copy the output would be `[Reading, Gaming]`, and the "immutable" object would have changed behind your back.

The getter's `unmodifiableList` guards the other direction:

```java
user.getHobbies().add("Chess");
```

```output
Exception in thread "main" java.lang.UnsupportedOperationException
	at java.base/java.util.Collections$UnmodifiableCollection.add(Collections.java:1093)
```

Both halves are needed. Copy on the way in, wrap on the way out.

**Interview answer:** `final` fields, `final` class, no setters, defensive copies in constructor and getters.

---

## Records — Immutable Classes the Easy Way (Java 16+)

Java 16 introduced `record` as a concise way to create immutable data classes. It auto-generates the constructor, getters, `equals()`, `hashCode()`, and `toString()`.

```java
public record Point(int x, int y) {
    // Automatically generates:
    // - final fields
    // - constructor
    // - getters
    // - equals(), hashCode(), toString()
}

Point p1 = new Point(5, 10);
System.out.println(p1.x());  // 5
System.out.println(p1.y());  // 10
```

#### Output

```output
5
10
```

The generated `toString` and `equals` come free, and they are what make records worth using:

```java
System.out.println(p1);
System.out.println(p1.equals(new Point(5, 10)));
```

```output
Point[x=5, y=10]
true
```

Note the accessors are `x()` and `y()`, not `getX()` and `getY()`. And `equals` compares **values** — two separately constructed `Point(5, 10)` objects are equal, which a normal class would report as `false` unless you wrote `equals` by hand.

You can add validation in a compact constructor:

```java
public record Person(String name, int age) {
    public Person {
        if (age < 0) throw new IllegalArgumentException("Age must be positive");
    }
}
```

#### Input

```java
new Person("Bob", -1);
```

#### Output

```output
Exception in thread "main" java.lang.IllegalArgumentException: Age must be positive
	at Person.<init>(Person.java:3)
```

The compact constructor has no parameter list and no assignments — you validate (or normalise) the parameters, and the compiler adds the field assignments afterwards. Because it runs before the fields are set, an invalid `Person` can never exist.

Records are ideal for DTOs, value objects, and any class that is just a container for data.

---

## Multiple Inheritance via Interfaces

Java does **not** support multiple inheritance of classes — a class can only `extend` one parent. However, a class **can implement multiple interfaces**, giving it behaviour from multiple sources.

Interfaces can also provide `default` method implementations, so implementing classes inherit behaviour without writing it themselves.

```java
public interface Swimmer {
    void swim();
    default void splash() {
        System.out.println("Splash!");
    }
}

public interface Runner {
    void run();
}

public class Athlete implements Swimmer, Runner {
    @Override
    public void swim() {
        System.out.println("Swimming...");
    }
    
    @Override
    public void run() {
        System.out.println("Running...");
    }
    // Inherited splash() from Swimmer
}

Athlete athlete = new Athlete();
athlete.swim();     // "Swimming..."
athlete.run();      // "Running..."
athlete.splash();   // "Splash!"
```

#### Output

```output
Swimming...
Running...
Splash!
```

`swim()` and `run()` came from the two interfaces the class implemented; `splash()` was never written in `Athlete` at all — it is inherited as a `default` method from `Swimmer`.

If both interfaces declared a `default` method with the same signature, the class would fail to compile until you override it and pick a winner with `Swimmer.super.splash()`. That is Java's answer to the diamond problem: it makes you decide, rather than guessing for you.

`Athlete` gets behaviour from both `Swimmer` and `Runner` without the diamond problem, because interfaces do not carry state.

---

## Common Mistakes to Avoid

- Forgetting `@Override` annotation (silently creates a new method instead of overriding)
- Using `==` for String comparison — use `.equals()` or `.compareTo()`
- Not making defensive copies in immutable classes (breaks immutability)
- Using `run()` instead of `start()` when starting threads
