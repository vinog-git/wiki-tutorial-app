# Domain: B2B (Business to Business)

## What it is

B2B means a company sells products or services to other businesses, not to individual consumers. The buyer is an organization, and the purchase is usually made by several people, each with a different role and concern.

## How B2B differs from B2C

- **Buyers.** A committee or several stakeholders decide, not one person.
- **Sales cycle.** Months are common, not minutes.
- **Deal size.** Larger contract values, often negotiated.
- **Contracts.** Formal agreements, procurement reviews, and legal terms.
- **Relationships.** Renewals and expansion matter more than one-time sales.
- **Requirements.** Security reviews, compliance certifications, integrations, and admin controls.

## The buying group

A typical B2B purchase involves:

- **Economic buyer.** Controls the budget and signs the contract.
- **Champion.** Inside the company, believes in the product, and pushes it internally.
- **Technical evaluator.** Checks security, architecture, and integration.
- **End users.** Will use the product daily and influence adoption.
- **Procurement and legal.** Negotiate terms, pricing, and risk.

Sales and product work should address each role. A feature that wins the champion can still fail at the security review.

## Key metrics

- **Pipeline and win rate.** How many opportunities exist and how many close.
- **Average contract value (ACV).** Typical annual value per customer.
- **Sales cycle length.** Time from first contact to signed contract.
- **Net revenue retention.** Growth from existing accounts. See [SaaS](/Domain/SaaS) for related measures.

## Enterprise expectations

Enterprise buyers often require:

- Single sign-on (SAML or OIDC) and role-based access control
- Audit logs and data export
- Security documentation, such as a SOC 2 report
- Data residency and retention options
- A service level agreement with defined credits for downtime
- Contracts that include a data processing agreement

## Why it matters for engineering

B2B requirements shape the product. Multi-tenant isolation, admin features, auditability, and integrations are often needed to close deals, even when end users do not ask for them directly. Teams that plan for these early avoid costly rework during a sales push.
