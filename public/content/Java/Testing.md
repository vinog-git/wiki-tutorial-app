# Java Testing Guide - Unit Tests & Performance Tests

## Overview

This guide includes two complete, working examples:

1. **CalculatorTest.java** - Unit testing with JUnit 5
2. **PerformanceTest.java** - Load testing with 1000 concurrent requests

---

## File 1: CalculatorTest.java

### What It Does

Tests a simple `Calculator` class with multiple test cases covering:
- Addition (positive, negative, zero)
- Subtraction
- Multiplication
- Division (including division by zero exception)
- Edge cases (large numbers, multiple operations)

### Test Structure (AAA Pattern)

```java
@Test
@DisplayName("Adding two positive numbers")
public void testAddPositiveNumbers() {
    // Arrange - Set up test data
    int a = 5;
    int b = 3;
    int expected = 8;

    // Act - Call the method
    int result = calculator.add(a, b);

    // Assert - Check the result
    assertEquals(expected, result, "5 + 3 should equal 8");
}
```

#### Output

When the assertion holds, JUnit prints nothing for the test beyond a pass marker:

```output
✓ Adding two positive numbers
```

The interesting case is a failure. Change the expectation to `9` and you get:

```output
Adding two positive numbers  FAILED
org.opentest4j.AssertionFailedError: 5 + 3 should equal 8 ==> expected: <9> but was: <8>
	at CalculatorTest.testAddPositiveNumbers(CalculatorTest.java:13)
```

Note the third argument surfacing in the message. That is the whole reason to supply it — `expected: <9> but was: <8>` alone tells you a number is wrong, but not which assertion out of fourteen produced it.

### Test Cases Included

| Test | Purpose |
|------|---------|
| testAddPositiveNumbers | Test normal addition |
| testAddNegativeNumbers | Test with negative values |
| testAddMixedNumbers | Test with positive and negative |
| testAddZero | Test edge case (zero) |
| testSubtractPositiveNumbers | Test subtraction |
| testSubtractResultNegative | Test negative result |
| testMultiplyPositiveNumbers | Test multiplication |
| testMultiplyByZero | Test multiplication by zero |
| testMultiplyNegativeNumbers | Test negative multiplication |
| testDividePositiveNumbers | Test normal division |
| testDivideDecimalResult | Test decimal result |
| testDivideByZeroThrowsException | Test exception handling |
| testWithLargeNumbers | Test edge case |
| testMultipleOperations | Test chained operations |

### Setup (Maven)

Add to `pom.xml`:

```xml
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>5.9.2</version>
    <scope>test</scope>
</dependency>
```

### How to Run

```bash
# Maven
mvn test

# Gradle
gradle test

# IDE (VS Code, IntelliJ)
# Right-click on test class → Run Tests
```

### Expected Output

```output
Calculator Tests
✓ Adding two positive numbers
✓ Adding negative numbers
✓ Adding positive and negative
✓ Adding zero
✓ Subtracting two positive numbers
✓ Subtracting results in negative
✓ Multiplying two positive numbers
✓ Multiplying by zero
✓ Multiplying negative numbers
✓ Dividing two positive numbers
✓ Division resulting in decimal
✓ Division by zero throws exception
✓ Test with large numbers
✓ Multiple operations

Tests run: 14, Failures: 0, Skipped: 0
```

### Key Assertions Used

```java
// Check equality
assertEquals(expected, actual);

// Check with tolerance (for floats)
assertEquals(3.333, result, 0.001);

// Check conditions
assertTrue(condition);
assertFalse(condition);

// Check null
assertNull(value);
assertNotNull(value);

// Check exceptions
assertThrows(ExceptionType.class, () -> method());
```

#### Output

The tolerance overload is the one worth demonstrating, because exact float equality is a classic false failure:

```java
double result = 10.0 / 3;
System.out.println(result);
assertEquals(3.333, result, 0.001);   // passes
assertEquals(3.333, result);          // fails
```

```output
3.3333333333333335
```

```output
org.opentest4j.AssertionFailedError: expected: <3.333> but was: <3.3333333333333335>
```

`10.0 / 3` is not `3.333` and never will be — the actual difference is about `3.33e-4`, comfortably inside the `0.001` delta but not zero. **Always use the three-argument form for `double` and `float`.**

And `assertThrows` returns the exception, so you can assert on its message too:

```java
ArithmeticException e = assertThrows(ArithmeticException.class, () -> calculator.divide(1, 0));
assertEquals("/ by zero", e.getMessage());
```

```output
✓ Division by zero throws exception
```

If the method does *not* throw, the failure is explicit rather than a silent pass:

```output
org.opentest4j.AssertionFailedError: Expected java.lang.ArithmeticException to be thrown, but nothing was thrown.
```

---

## File 2: PerformanceTest.java

### What It Does

Sends **1000 concurrent HTTP requests** to a test API and measures:
- Total success/failure rate
- Response time statistics (min, max, average, percentiles)
- Throughput (requests per second)
- P50, P95, P99 percentiles

### Architecture

```
Main Thread (Submits all requests)
    |
    ├── Thread 1  ──> Request 1-20
    ├── Thread 2  ──> Request 21-40
    ├── Thread 3  ──> Request 41-60
    ...
    └── Thread 50 ──> Request 980-1000
    |
    └── Wait for all ──> Collect metrics
```

### Key Features

**Thread Pool (50 threads)**
- 50 concurrent requests at a time
- Efficient resource usage

**Response Time Tracking**
- Measures each request individually
- Stores all response times
- Calculates statistics

**Progress Reporting**
- Shows progress every 100 requests
- Real-time feedback

**Comprehensive Metrics**
- Success/failure rate
- Min/max/average response time
- Percentiles (P50, P95, P99)
- Requests per second (RPS)

### How to Run

```bash
# Compile
javac PerformanceTest.java

# Run
java PerformanceTest
```

### Expected Output

Figures below are from one sample run against a public demo API — your numbers will differ with network and machine.

```output
PERFORMANCE TEST - 1000 CONCURRENT REQUESTS

Test Configuration:
   Total Requests: 1000
   Thread Pool Size: 50
   Target API: https://jsonplaceholder.typicode.com/posts/1

Starting 1000 requests...

   Submitted 100 requests...
   Submitted 200 requests...
   (continues until 1000)

All requests completed!

TEST RESULTS

Overall Statistics:
   Total Requests: 1000
   Successful: 1000
   Failed: 0
   Success Rate: 100.00%

Response Time Statistics (in milliseconds):
   Minimum: 145 ms
   Maximum: 2845 ms
   Average: 567 ms
   Median (P50): 512 ms
   P95: 1200 ms
   P99: 1850 ms

Throughput:
   Requests per second: 342.47
```

### How to Interpret Results

| Metric | What It Means |
|--------|--------------|
| **Success Rate** | Percentage of requests that succeeded |
| **Min Response Time** | Fastest request (lower is better) |
| **Max Response Time** | Slowest request (indicates outliers) |
| **Average Response Time** | Mean time across all requests |
| **P50 (Median)** | 50% of requests were faster than this |
| **P95** | 95% of requests completed within this time |
| **P99** | 99% of requests completed within this time |
| **RPS** | Requests per second throughput |

### Modifying the Test

```java
// Change target API
private static final String API_URL = "https://your-api.com/endpoint";

// Change number of requests
private static final int NUM_REQUESTS = 5000;

// Change thread pool size
private static final int THREAD_POOL_SIZE = 100;
```

---

## Comparison: Unit Testing vs Performance Testing

| Aspect | Unit Testing | Performance Testing |
|--------|--------------|-------------------|
| **Purpose** | Test correctness | Test speed & capacity |
| **What to test** | Individual methods | Full endpoints |
| **Number of tests** | Many small tests | Few large tests |
| **Metrics** | Pass/fail | Response time, throughput |
| **Tools** | JUnit, TestNG | Custom code, JMeter |
| **Speed** | Milliseconds | Seconds to minutes |
| **Environment** | Any | Production-like |
| **Frequency** | Every commit | Periodically |

---

## Real-World Performance Testing

### Testing Your Own API

```java
// For localhost
private static final String API_URL = "http://localhost:8080/api/users";

// For staging
private static final String API_URL = "https://staging-api.example.com/users";
```

### What Good Metrics Look Like

| Metric | Excellent | Good | Poor |
|--------|-----------|------|------|
| **Avg Response Time** | < 100 ms | 100-500 ms | > 500 ms |
| **P95** | < 200 ms | 200-1000 ms | > 1000 ms |
| **P99** | < 500 ms | 500-2000 ms | > 2000 ms |
| **Success Rate** | 99.99% | 99.9% | < 99.9% |

---

## Best Practices

### Unit Testing

**Do:**
- Test one thing per test
- Use descriptive names
- Test normal cases AND edge cases
- Test error conditions
- Keep tests independent
- Use AAA pattern (Arrange-Act-Assert)
- Mock external dependencies

**Don't:**
- Test multiple things in one test
- Use vague names like `test1`
- Skip edge cases
- Test internal implementation details
- Make tests depend on each other

### Performance Testing

**Do:**
- Start with realistic load
- Test at expected peak load
- Run multiple times (results vary)
- Monitor server metrics during test
- Use production-like data
- Document baseline metrics

**Don't:**
- Test with unrealistic loads
- Run just once (variance matters)
- Ignore outliers
- Test during heavy production traffic

---

## Analyzing Performance Test Results

### Scenario 1: Healthy API

```
Success Rate: 100.00%
P95: 250 ms
P99: 450 ms
Average: 180 ms
RPS: 500+

Conclusion: API is performing well
```

### Scenario 2: Database Bottleneck

```
Success Rate: 100.00%
P95: 2000 ms (very slow)
P99: 5000 ms (extremely slow)
Average: 1500 ms

Conclusion: Some queries are taking too long
Action: Optimize slow queries or add indexes
```

### Scenario 3: Server Overload

```
Success Rate: 95.5%
Failures: 45 errors
P99: 10000+ ms

Conclusion: Server can't handle this load
Action: Scale up or optimize code
```

---

## Advanced: Custom Performance Metrics

```java
// Track response times by endpoint
Map<String, List<Long>> endpointTimes = new ConcurrentHashMap<>();

// Track error types
Map<Integer, Integer> statusCodeCounts = new ConcurrentHashMap<>();

// Calculate standard deviation
double stdDev = Math.sqrt(
    responseTimes.stream()
        .mapToDouble(x -> Math.pow(x - average, 2))
        .average()
        .orElse(0)
);

System.out.println("Standard Deviation: " + stdDev + " ms");
```

---

## Complete Testing Toolkit

| Task | Tool | File |
|------|------|------|
| Unit testing | JUnit 5 | CalculatorTest.java |
| Mocking | Mockito | (separate dependency) |
| Performance testing | Custom Java | PerformanceTest.java |
| Load testing (advanced) | Apache JMeter | (GUI tool) |
| API testing | REST Assured | (separate dependency) |

---

## Quick Reference

```bash
# Run unit tests
mvn test

# Compile and run performance test
javac PerformanceTest.java
java PerformanceTest
```

**Expected Time:**
- Unit tests: < 1 second
- Performance test: 30-60 seconds (depending on network)
