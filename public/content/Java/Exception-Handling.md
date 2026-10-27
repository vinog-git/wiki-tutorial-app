# Java Exception Handling

## What are Exceptions?

An exception is an event that disrupts the normal flow of a program — a file not found, a null reference, dividing by zero. Java uses a structured exception mechanism so you can detect problems, respond to them, and clean up resources without crashing.

## Exception Types

| Type | When | Examples |
|------|------|---------|
| **Checked** | Compile-time — must handle or declare | `IOException`, `SQLException`, `FileNotFoundException` |
| **Unchecked** | Runtime — can occur anywhere | `NullPointerException`, `ArrayIndexOutOfBoundsException`, `ArithmeticException` |
| **Error** | Serious JVM problems | `OutOfMemoryError`, `StackOverflowError` |

---

## try-catch-finally

The core building block. Put risky code in `try`, handle specific exceptions in `catch`, and use `finally` for cleanup that must always run (closing files, releasing locks).

```java
public class ExceptionHandling {
    public static void divide(int a, int b) {
        try {
            int result = a / b;  // May throw ArithmeticException
            System.out.println("Result: " + result);
        } catch (ArithmeticException e) {
            System.out.println("Error: Cannot divide by zero");
            e.printStackTrace();
        } catch (Exception e) {
            System.out.println("General error: " + e.getMessage());
        } finally {
            System.out.println("Always executes");
        }
    }
}
```

#### Input

```java
divide(10, 2);
divide(10, 0);
```

#### Output

```output
Result: 5
Always executes
Error: Cannot divide by zero
java.lang.ArithmeticException: / by zero
	at ExceptionHandling.divide(ExceptionHandling.java:4)
Always executes
```

`Always executes` appears in both runs — that is the point of `finally`. Note also that the second `catch (Exception e)` never fires: `ArithmeticException` was already matched by the more specific handler above it.

The `finally` block runs whether or not an exception was thrown — even if a `catch` block itself throws. Use it for cleanup.

Integer division by zero throws; **floating-point** division does not. `10.0 / 0` quietly gives you `Infinity`, and `0.0 / 0` gives `NaN`:

```java
System.out.println(10.0 / 0);
System.out.println(0.0 / 0);
```

```output
Infinity
NaN
```

---

## Multiple catch Blocks

You can catch different exception types separately. Java tries each `catch` in order from top to bottom — more specific exceptions must come before more general ones.

```java
public void handleMultipleExceptions() {
    try {
        String str = null;
        str.length();  // NullPointerException
        int[] arr = {1, 2};
        System.out.println(arr[5]);  // ArrayIndexOutOfBoundsException
    } catch (NullPointerException e) {
        System.out.println("Null pointer error");
    } catch (ArrayIndexOutOfBoundsException e) {
        System.out.println("Array index out of bounds");
    } catch (Exception e) {  // Catches any exception not caught above
        System.out.println("Generic error");
    }
}
```

#### Output

```output
Null pointer error
```

Only **one** catch block ever runs. `str.length()` throws immediately, control jumps straight to the matching handler, and the array lines are never reached — so `ArrayIndexOutOfBoundsException` never happens at all. To see the second handler fire you would have to remove the first two lines.

**Rule:** Always put `catch (Exception e)` last. Putting it first would swallow all exceptions before the specific handlers get a chance. Java enforces this for related types — a specific handler placed *after* a broader one is a compile error:

```output
error: exception NullPointerException has already been caught
        } catch (NullPointerException e) {
          ^
```

---

## throws — Propagating Exceptions

If your method cannot handle an exception, declare it with `throws` to tell callers they must deal with it. This applies to **checked exceptions** only.

```java
public static void readFile(String filename) throws FileNotFoundException {
    FileReader file = new FileReader(filename);  // throws checked exception
}
```

Callers of `readFile()` must either catch `FileNotFoundException` or declare `throws FileNotFoundException` themselves.

---

## Custom Exceptions

Create your own exception by extending `Exception` (checked) or `RuntimeException` (unchecked). This makes error handling more expressive and lets callers distinguish your domain errors from generic ones.

```java
public static class AgeException extends Exception {
    public AgeException(String message) {
        super(message);
    }
}

public void validateAge(int age) throws AgeException {
    if (age < 0) {
        throw new AgeException("Age cannot be negative");
    }
}
```

---

## try-with-resources

Resources like file handles and database connections must be closed after use. `try-with-resources` closes them automatically — even if an exception is thrown — as long as they implement `AutoCloseable`.

```java
public void readFileModern(String filename) throws IOException {
    try (FileReader file = new FileReader(filename)) {
        // Use file
    }  // file automatically closes here
}
```

#### Output

Calling it with a filename that does not exist:

```output
Exception in thread "main" java.io.FileNotFoundException: nope.txt (No such file or directory)
```

The resource still gets closed on the way out — that is the guarantee `try-with-resources` adds.

No `finally` block needed. Equivalent to calling `file.close()` in a `finally`, but safer and cleaner.

---

## Practical Example: Bank Account

This example combines custom exceptions, synchronized methods, and proper exception handling in a realistic scenario.

```java
public class BankAccount {
    private double balance;
    private final String accountNumber;
    private final List<String> transactionHistory = new ArrayList<>();
    
    public BankAccount(String accountNumber, double initialBalance) {
        this.accountNumber = accountNumber;
        this.balance = initialBalance;
        transactionHistory.add("Initial deposit: " + initialBalance);
    }
    
    public synchronized void deposit(double amount) throws IllegalArgumentException {
        if (amount <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
        balance += amount;
        transactionHistory.add("Deposit: +" + amount);
        System.out.println("Deposited: " + amount + ", Balance: " + balance);
    }
    
    public synchronized void withdraw(double amount) throws InsufficientFundsException {
        if (amount <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
        if (balance < amount) {
            throw new InsufficientFundsException("Insufficient funds. Balance: " + balance);
        }
        balance -= amount;
        transactionHistory.add("Withdrawal: -" + amount);
        System.out.println("Withdrawn: " + amount + ", Balance: " + balance);
    }
    
    public synchronized double getBalance() { return balance; }
    
    public List<String> getTransactionHistory() {
        return new ArrayList<>(transactionHistory);
    }
    
    // Custom Exception
    public static class InsufficientFundsException extends Exception {
        public InsufficientFundsException(String message) {
            super(message);
        }
    }
}
```

Calling the bank account with proper exception handling:

```java
BankAccount account = new BankAccount("ACC001", 5000);
try {
    account.deposit(1000);
    account.withdraw(500);
    account.withdraw(10000);  // Throws InsufficientFundsException
} catch (BankAccount.InsufficientFundsException e) {
    System.out.println("Error: " + e.getMessage());
} catch (IllegalArgumentException e) {
    System.out.println("Invalid amount: " + e.getMessage());
}
```

#### Output

```output
Deposited: 1000.0, Balance: 6000.0
Withdrawn: 500.0, Balance: 5500.0
Error: Insufficient funds. Balance: 5500.0
```

The third call fails, so its `balance -= amount` never runs — the balance stays at 5,500 and the transaction history records only what actually happened:

```java
System.out.println(account.getTransactionHistory());
```

```output
[Initial deposit: 5000.0, Deposit: +1000.0, Withdrawal: -500.0]
```

Throwing **before** mutating state is what makes this safe. Had `withdraw` subtracted first and validated afterwards, the failed call would have left the account corrupted.

Passing a negative amount takes the other branch:

```java
account.deposit(-5);
```

```output
Invalid amount: Amount must be positive
```

Note the amounts print as `1000.0` and `5000.0` — the fields are `double`, so whole numbers gain a `.0`. Real money code should use `BigDecimal`, since `double` cannot represent values like `0.10` exactly.

Key design decisions in this example:
- `deposit` and `withdraw` are `synchronized` — safe for multithreaded use
- Custom `InsufficientFundsException` makes the error case explicit to callers
- `transactionHistory` returns a defensive copy so callers can't mutate internal state

---

## Common Mistakes to Avoid

- **Catching `Exception` too broadly** — hides bugs; catch specific types first
- **Empty catch blocks** — silently swallows errors; at minimum log them
- **Forgetting `finally` for cleanup** — use try-with-resources instead
- **Throwing checked exceptions from constructors carelessly** — callers must handle them
- **Using exceptions for normal control flow** — exceptions are expensive; use conditionals for expected branches
- **Not calling `e.printStackTrace()` or logging** — you lose the stack trace and can't debug

---

## Interview Quick Reference

**Q: What is the difference between checked and unchecked exceptions?**
Checked exceptions (e.g. `IOException`) are caught at compile-time — you must handle or declare them. Unchecked exceptions (e.g. `NullPointerException`) are runtime errors — the compiler doesn't force you to handle them.

**Q: What does `finally` always do?**
It always executes after `try`/`catch`, even if an exception was thrown or a `return` statement was reached. Use it for cleanup code.

**Q: What is the purpose of `throws` in a method signature?**
It declares that the method may throw a checked exception, forcing callers to handle or propagate it.
