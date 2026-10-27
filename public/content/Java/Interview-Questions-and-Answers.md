# Java: Interview Questions and Answers

Core Java interview questions covering language fundamentals, OOP, collections, streams, exceptions, and concurrency. For microservices-specific questions, see **Microservices Interview Preparation**.

## Language Fundamentals

### Q: What's the difference between `==` and `.equals()`?
`==` compares references for objects (whether two variables point to the same object in memory) or primitive values directly for primitives. `.equals()` compares logical/content equality, and its behavior depends on how the class overrides it (e.g., `String.equals()` compares character sequences).

```java
String a = new String("hello");
String b = new String("hello");
System.out.println(a == b);        // different objects
System.out.println(a.equals(b));   // same content
```

```output
false
true
```

The catch that makes this a real interview question: with **literals** instead of `new String(...)`, the answer flips, because identical literals are interned into the same object in the string pool:

```java
String c = "hello";
String d = "hello";
System.out.println(c == d);
```

```output
true
```

Same code shape, opposite result. This is exactly why `==` on strings is a bug even when it appears to work — it can pass every test using literals and fail the moment a string arrives from a file, a database or user input.

### Q: What's the difference between `String`, `StringBuilder`, and `StringBuffer`?
`String` is immutable - every modification creates a new object. `StringBuilder` is mutable and not thread-safe, making it fast for single-threaded string building. `StringBuffer` is mutable and thread-safe (synchronized methods), at the cost of some performance.

### Q: What is the difference between `final`, `finally`, and `finalize`?
- `final` - a keyword marking a variable as constant, a method as non-overridable, or a class as non-extendable.
- `finally` - a block that always executes after a `try`/`catch`, used for cleanup.
- `finalize()` - a deprecated `Object` method the garbage collector used to call before reclaiming an object; not reliable and no longer recommended (use `try-with-resources` instead).

### Q: What is autoboxing/unboxing?
Autoboxing is Java's automatic conversion between a primitive type and its wrapper class (e.g., `int` to `Integer`), and unboxing is the reverse. It happens implicitly, which can cause subtle bugs (like `NullPointerException` when unboxing a `null` wrapper) or performance costs in hot loops.

### Q: Why is `Integer` caching a common interview gotcha?
Java caches boxed `Integer` values from -128 to 127. Two `Integer` objects in that range created via autoboxing can be `==` equal (same cached instance), while values outside that range are not, even with the same numeric value.

```java
Integer a = 100, b = 100;
System.out.println(a == b);   // both use the cached instance

Integer c = 200, d = 200;
System.out.println(c == d);   // outside the cache range, different objects
```

```output
true
false
```

The same comparison, differing only in magnitude, gives opposite answers. `.equals()` is correct in both cases:

```java
System.out.println(c.equals(d));
```

```output
true
```

The related unboxing trap — a `null` wrapper assigned to a primitive:

```java
Map<String, Integer> map = new HashMap<>();
int value = map.get("missing");    // compiles fine
```

```output
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null
```

There is no `null` anywhere in that line, which is what makes it confusing. The compiler inserted `.intValue()` to unbox the `Integer` into an `int`, and `map.get` returned `null`.

## OOP

### Q: What's the difference between method overloading and overriding?
**Overloading** is defining multiple methods with the same name but different parameter lists in the same class (resolved at compile time). **Overriding** is a subclass providing a new implementation for a method inherited from its superclass (resolved at runtime via dynamic dispatch).

### Q: What is polymorphism, and what are its two forms?
Polymorphism means "many forms" - the ability of an object to take on multiple types. **Compile-time polymorphism** is achieved through method overloading. **Runtime polymorphism** is achieved through method overriding and dynamic dispatch, where the actual method invoked depends on the object's real type, not its declared reference type.

### Q: What's the difference between an abstract class and an interface?
An **abstract class** can have both abstract and concrete methods, constructors, and instance fields, but a class can only extend one abstract class. An **interface** defines a contract (and, since Java 8, can include default/static methods), and a class can implement multiple interfaces. Use an abstract class for closely related classes sharing implementation; use an interface to define a capability across unrelated classes.

### Q: What is encapsulation, and why does it matter?
Encapsulation is bundling data (fields) and the methods that operate on it within a class, while restricting direct external access (via `private` fields and public getters/setters). It protects invariants, hides implementation details, and lets you change internals without breaking callers.

## Collections

### Q: What's the difference between `ArrayList` and `LinkedList`?
`ArrayList` is backed by a dynamic array - fast random access (`O(1)` get by index) but slower insertion/removal in the middle (`O(n)`, needs shifting). `LinkedList` is a doubly-linked list - fast insertion/removal at known positions (`O(1)`) but slow random access (`O(n)`, must traverse).

### Q: What's the difference between `HashMap`, `LinkedHashMap`, and `TreeMap`?
- `HashMap` - no guaranteed order, O(1) average get/put.
- `LinkedHashMap` - preserves insertion order (or access order, if configured), slightly more overhead than `HashMap`.
- `TreeMap` - keeps keys sorted (natural order or a `Comparator`), O(log n) get/put via a red-black tree.

### Q: What's the difference between `HashSet` and `TreeSet`?
`HashSet` stores unique elements with no guaranteed order and O(1) average operations, backed internally by a `HashMap`. `TreeSet` keeps elements sorted, with O(log n) operations, backed by a `TreeMap`.

### Q: Why do you need to override both `equals()` and `hashCode()` together?
Hash-based collections (`HashMap`, `HashSet`) use `hashCode()` to locate the bucket an object belongs to, then `equals()` to check for actual equality within that bucket. If you override `equals()` without `hashCode()` (or vice versa), two "equal" objects can end up with different hash codes and the collection will fail to find/deduplicate them correctly.

### Q: Is `ArrayList` thread-safe? What are the alternatives?
No. `ArrayList` (and most standard collections) are not thread-safe. Alternatives: wrap it with `Collections.synchronizedList(...)`, use `CopyOnWriteArrayList` for read-heavy/write-rare scenarios, or use concurrent collections like `ConcurrentHashMap` for maps.

## Streams and Lambdas

### Q: What is a Stream, and how is it different from a Collection?
A `Stream` is a sequence of elements supporting functional-style operations (map, filter, reduce) computed lazily and often in a single pass. Unlike a `Collection`, a stream doesn't store data - it's a pipeline over a data source, is traversed only once, and can be processed sequentially or in parallel.

```java
List<String> names = List.of("Ada", "Grace", "Alan");
List<String> longNames = names.stream()
    .filter(n -> n.length() > 3)
    .map(String::toUpperCase)
    .collect(Collectors.toList());
System.out.println(longNames);
```

```output
[GRACE, ALAN]
```

`Ada` is exactly three characters, and the filter asks for **more than** three, so it is excluded. Off-by-one boundaries like this are worth checking deliberately — `>` versus `>=` is the difference between two results and three.

### Q: What's the difference between intermediate and terminal stream operations?
**Intermediate** operations (`map`, `filter`, `sorted`) return a new stream and are lazy - they don't execute until a terminal operation is invoked. **Terminal** operations (`collect`, `forEach`, `reduce`, `count`) trigger the actual traversal and produce a result or side effect.

### Q: What is a functional interface?
An interface with exactly one abstract method, which can be implemented with a lambda expression or method reference. Examples: `Runnable`, `Comparator<T>`, `Function<T, R>`, `Predicate<T>`, `Supplier<T>`.

## Exception Handling

### Q: What's the difference between checked and unchecked exceptions?
**Checked exceptions** (subclasses of `Exception`, excluding `RuntimeException`) must be either caught or declared with `throws` - the compiler enforces handling. **Unchecked exceptions** (subclasses of `RuntimeException`) don't require explicit handling and typically represent programming errors (`NullPointerException`, `IllegalArgumentException`).

### Q: What is try-with-resources, and why use it?
A `try` statement that automatically closes any resource implementing `AutoCloseable` when the block exits, even if an exception is thrown - eliminating the need for manual `finally` blocks to close streams, connections, etc.

```java
try (BufferedReader reader = new BufferedReader(new FileReader("file.txt"))) {
    return reader.readLine();
} // reader.close() is called automatically
```

### Q: Can you catch multiple exception types in one catch block?
Yes, using the multi-catch syntax with `|`, as long as the exception types aren't related by inheritance.

```java
try {
    riskyOperation();
} catch (IOException | SQLException e) {
    log.error("Operation failed", e);
}
```

## Concurrency

### Q: What's the difference between a process and a thread?
A **process** is an independent execution unit with its own memory space. A **thread** is a lightweight unit of execution within a process, sharing the process's memory with other threads - which is what makes thread synchronization necessary.

### Q: What is a race condition, and how do you prevent it?
A race condition occurs when multiple threads access and modify shared data concurrently, and the outcome depends on the unpredictable timing of their execution. Prevent it with synchronization (`synchronized`, `Lock`), atomic classes (`AtomicInteger`), or by avoiding shared mutable state altogether (immutable objects, thread confinement).

### Q: What's the difference between `synchronized` and `ReentrantLock`?
`synchronized` is a built-in keyword providing simple mutual exclusion with automatic lock release. `ReentrantLock` (from `java.util.concurrent.locks`) offers more control - tryLock with timeout, interruptible lock acquisition, fairness policies, and multiple condition variables - at the cost of requiring manual `unlock()` (typically in a `finally` block).

### Q: What is a deadlock, and how can it happen?
A deadlock occurs when two or more threads are each waiting for a resource the other holds, so none can proceed. Classic cause: Thread A locks resource 1 then waits for resource 2, while Thread B locks resource 2 then waits for resource 1. Prevent it by always acquiring locks in a consistent global order.

## Spring Boot

### Q: What is dependency injection, and how does Spring implement it?
Dependency injection is a design pattern where an object's dependencies are provided (injected) by an external framework rather than created by the object itself. Spring implements it via its IoC (Inversion of Control) container, which manages bean creation and wiring, typically via constructor injection with `@Autowired` or component scanning (`@Component`, `@Service`, `@Repository`).

### Q: What's the difference between `@Component`, `@Service`, and `@Repository`?
All three are specializations of `@Component` and are functionally interchangeable for component scanning, but they signal intent: `@Service` marks business logic classes, `@Repository` marks data-access classes (and enables automatic exception translation for persistence errors), and `@Component` is the generic form.

### Q: What is the default bean scope in Spring, and what other scopes exist?
The default scope is **singleton** - one shared instance per Spring container. Other scopes include `prototype` (a new instance every time it's requested), and web-aware scopes like `request` and `session`.

## Next Steps

For microservices-specific interview questions (service discovery, resilience patterns, distributed tracing, Kafka), see **Microservices Interview Preparation**.
