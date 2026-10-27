# DTO (Data Transfer Object)

## What is a DTO?

**DTO = A simple container that carries data from one place to another**

Think of it like a suitcase:
- Your house has ALL your belongings (Entity)
- You pack ONLY what you need in a suitcase (DTO)
- You travel with the suitcase — you don't take everything with you

```
Entity (Database):
├─ Password        ← Don't share
├─ SSN             ← Don't share
├─ Salary          ← Don't share
├─ Username        ← OK to share
├─ Email           ← OK to share
└─ Phone           ← OK to share

DTO (What gets shared):
├─ Username
├─ Email
└─ Phone
```

---

## The Problem: Sending Entities Directly

```java
// Database object — has ALL fields
public class User {
    private String username;
    private String password;    // Sensitive!
    private String email;
    private String ssn;         // Very sensitive!
    private double salary;      // Private!
    private String bankAccount; // Extremely sensitive!
}

// Sending entity directly to client
User user = getUserFromDatabase();
return user;  // Exposes password, SSN, salary, bank account!
```

**Client receives:**
```json
{
  "username": "john_doe",
  "password": "secret123",
  "email": "john@example.com",
  "ssn": "123-45-6789",
  "salary": 50000,
  "bankAccount": "123456789"
}
```

---

## The Solution: Use a DTO

```java
// DTO - only the safe fields
public class UserDTO {
    private String username;
    private String email;
    private String phoneNumber;

    public UserDTO(String username, String email, String phoneNumber) {
        this.username = username;
        this.email = email;
        this.phoneNumber = phoneNumber;
    }

    // Getters only (no sensitive data)
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getPhoneNumber() { return phoneNumber; }
}

// Service converts entity to DTO before returning
public UserDTO getUserForClient(long userId) {
    User user = getUserFromDatabase(userId);  // Full entity

    return new UserDTO(
        user.getUsername(),
        user.getEmail(),
        user.getPhoneNumber()
        // Note: NO password, SSN, or salary
    );
}
```

**Client receives:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "phone": "555-1234"
}
```

Password, SSN, salary, and bank account are never exposed.

---

## How DTOs Flow Through the App

### Step 1: Data in Database
```
Database Table: users
┌────┬──────────┬────────────┬──────────────────────┐
│ id │ username │ password   │ email                │
├────┼──────────┼────────────┼──────────────────────┤
│ 1  │ john_doe │ secret123  │ john@example.com     │
└────┴──────────┴────────────┴──────────────────────┘
```

### Step 2: Read from Database
```java
User user = database.getUser(1);
// user has: id, username, password, email, ssn, salary...
```

```output
User{id=1, username='john_doe', password='$2a$10$N9qo8uLO...',
     email='john@example.com', ssn='123-45-6789', salary=85000.0}
```

Everything the table holds, including the three fields that must never leave the server.

### Step 3: Convert to DTO
```java
UserDTO dto = new UserDTO(
    user.getId(),
    user.getUsername(),
    user.getEmail()
    // No password!
);
```

```output
UserDTO{id=1, username='john_doe', email='john@example.com'}
```

Three fields in, three fields out. `password`, `ssn` and `salary` are not omitted by a serializer setting or an annotation — they are absent from the type, so there is no configuration anyone can get wrong later.

### Step 4: Send to Client
```
HTTP Response:
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com"
}
```

---

## Real-World Scenario: Bank Application

```
DATABASE (Entity - Full Info):
  BankAccount {
    accountNumber
    balance          ← Sensitive
    pin              ← Very sensitive
    password         ← Very sensitive
    customerId
    ownerName
    creditScore      ← Private
    loanHistory      ← Private
  }

CUSTOMER APP (what customer sees):
  BankAccountDTO {
    accountNumber
    balance
    ownerName
  }

EMPLOYEE APP (what employee sees):
  BankAccountAdminDTO {
    accountNumber
    balance
    customerId
    ownerName
    creditScore
    loanHistory
    pin              (even admin doesn't see)
    password         (even admin doesn't see)
  }
```

Different DTOs for different audiences — one entity, many views.

---

## DTO vs Entity

| Aspect | Entity | DTO |
|--------|--------|-----|
| **Purpose** | Database mapping | Data transfer |
| **Contains** | ALL data (sensitive + public) | ONLY needed data |
| **Used where** | Inside the application | Between layers / over APIs |
| **Sensitivity** | Can have sensitive fields | Should not have sensitive fields |
| **Complexity** | Complex relationships, many fields | Simple, flat structure |
| **Mutability** | Mutable (getters + setters) | Often immutable (getters only) |

---

## Common DTO Patterns

### Pattern 1: Simple Constructor DTO (Most Common)

```java
public class PersonDTO {
    private String name;
    private int age;
    private String email;

    public PersonDTO(String name, int age, String email) {
        this.name = name;
        this.age = age;
        this.email = email;
    }

    public String getName() { return name; }
    public int getAge() { return age; }
    public String getEmail() { return email; }
}

// Usage
PersonDTO dto = new PersonDTO("John", 30, "john@example.com");
System.out.println(dto);
```

```output
PersonDTO{name='John', age=30, email='john@example.com'}
```

(Assuming a `toString()`; without one you get `PersonDTO@4617c264`.)

All three fields are supplied at construction, so the object can never exist in a half-built state — the main argument for this pattern.

### Pattern 2: Mutable DTO (with Setters)

```java
public class PersonDTO {
    private String name;
    private int age;
    private String email;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}
```

#### Output

The cost of setters is that a partially-populated object is legal:

```java
PersonDTO dto = new PersonDTO();
System.out.println(dto);

dto.setName("John");
dto.setAge(30);
System.out.println(dto);   // email was never set
```

```output
PersonDTO{name='null', age=0, email='null'}
PersonDTO{name='John', age=30, email='null'}
```

Note `age=0` rather than null — an unset `int` defaults to zero, which is indistinguishable from someone deliberately setting it to zero. That ambiguity is why `Integer` is often preferred in a mutable DTO.

Frameworks like Jackson need a no-arg constructor and setters to deserialize JSON, which is why this pattern persists despite the downside.

### Pattern 3: Builder Pattern (Flexible)

```java
public class PersonDTO {
    private String name;
    private int age;
    private String email;

    private PersonDTO(Builder builder) {
        this.name = builder.name;
        this.age = builder.age;
        this.email = builder.email;
    }

    public static class Builder {
        private String name;
        private int age;
        private String email;

        public Builder withName(String name) { this.name = name; return this; }
        public Builder withAge(int age) { this.age = age; return this; }
        public Builder withEmail(String email) { this.email = email; return this; }

        public PersonDTO build() { return new PersonDTO(this); }
    }
}

// Usage
PersonDTO dto = new PersonDTO.Builder()
    .withName("John")
    .withAge(30)
    .withEmail("john@example.com")
    .build();
System.out.println(dto);
```

```output
PersonDTO{name='John', age=30, email='john@example.com'}
```

The builder's selling point is that you can name each argument at the call site, so a four-string constructor cannot silently get its arguments swapped.

It shares the mutable DTO's weakness, though — skipping a field is still legal:

```java
PersonDTO partial = new PersonDTO.Builder().withName("John").build();
```

```output
PersonDTO{name='John', age=0, email='null'}
```

Add validation inside `build()` if a field is genuinely required.

Since Java 16 a `record` gives you most of this for one line, at the cost of the named-argument readability:

```java
record PersonDTO(String name, int age, String email) { }

System.out.println(new PersonDTO("John", 30, "john@example.com"));
```

```output
PersonDTO[name=John, age=30, email=john@example.com]
```

Records are immutable and generate `equals`, `hashCode` and `toString` — which makes them an excellent fit for **output** DTOs. For **input** DTOs that a framework must deserialize field-by-field, the mutable form is often still required.

---

## Input DTOs (Receiving Data from Client)

DTOs work in both directions — not just for output:

```java
// Client sends a POST to create a user
public class CreateUserDTO {
    private String username;
    private String email;
    private String password;  // OK here — client is sending it to create account
    private String address;
    private String phoneNumber;

    // Getters and setters
}
```

```
POST /api/users
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "secret123",
  "address": "123 Main St",
  "phoneNumber": "555-1234"
}

Server receives CreateUserDTO → validates → creates User entity → saves to DB
```

---

## Practical Example: E-Commerce API

### Product Entity (Database)
```java
public class Product {
    private long id;
    private String name;
    private double price;
    private double costPrice;    // Secret!
    private int stock;
    private double profitMargin; // Secret!
    private String supplier;     // Secret!
    private String adminNotes;   // Secret!
}
```

### Product DTO (What Customer Sees)
```java
public class ProductDTO {
    private long id;
    private String name;
    private double price;
    private int stock;

    public ProductDTO(long id, String name, double price, int stock) {
        this.id = id;
        this.name = name;
        this.price = price;
        this.stock = stock;
    }

    public long getId() { return id; }
    public String getName() { return name; }
    public double getPrice() { return price; }
    public int getStock() { return stock; }
}
```

### API Response
```
GET /api/products/123

{
  "id": 123,
  "name": "Laptop",
  "price": 999.99,
  "stock": 5
}

Customer sees: id, name, price, stock
Customer doesn't see: costPrice, profitMargin, supplier, adminNotes
```

---

## When to Use DTOs

**Use DTOs when:**
- Sending data over a REST API
- Returning database query results to a client
- Communicating between microservices
- Different users need different views of the same data
- You need API versioning (change entity without breaking the API)

**DTOs may not be needed when:**
- Internal method-to-method calls within the same layer
- The data has no sensitive fields whatsoever
- Quick prototypes (add DTOs before going to production)

---

## Benefits

| Benefit | Explanation |
|---------|-------------|
| **Security** | Never expose passwords, SSNs, salaries |
| **Control** | Decide exactly what data goes where |
| **Flexibility** | Different DTOs for different users/clients |
| **Performance** | Send only needed data — smaller payloads |
| **Clear contract** | Client knows exactly what to expect |
| **Decoupling** | Change entity internals without breaking the API |

---

## Quick Decision: Do I Need a DTO?

```
1. Are you sending data to another application/client?
   YES → Use DTO

2. Does your data have sensitive fields?
   YES → Use DTO

3. Do different users need different views of the data?
   YES → Use DTO

4. Is this a REST API endpoint?
   YES → Use DTO

None of the above? → Probably don't need one.
```

---

## Real-World Analogy: Restaurant Menu

```
KITCHEN (Entity - all info):
├─ Ingredients
├─ Supplier names
├─ Cost per item
├─ Profit margins
├─ Secret recipes
└─ Behind-the-scenes notes

MENU (DTO - what customer sees):
├─ Dish name
├─ Description
├─ Price
└─ Allergens

The kitchen holds everything (Entity).
The customer only sees what's on the menu (DTO).
The restaurant controls what gets shared.
```

---

## Summary

**DTOs are about control and security.** You decide what data to expose, to whom, and when.

| | |
|---|---|
| **What** | A simple container for transferring data |
| **Why** | Hide sensitive fields, control what's shared |
| **When** | REST APIs, DB responses, service communication |
| **How** | Get entity from DB → create DTO with safe fields → send DTO |
