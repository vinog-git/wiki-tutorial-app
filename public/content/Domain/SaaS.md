# Domain: SaaS (Software as a Service)

## What it is

SaaS is a software delivery model where the vendor hosts the application and customers access it over the internet, usually through a browser. Customers do not install, patch, or run the software themselves. They pay a recurring fee, typically monthly or annually, instead of a one-time license.

## How it differs from traditional software

- **Hosting.** The vendor runs the servers. The customer does not.
- **Updates.** The vendor ships changes to everyone at once. Customers do not manage version upgrades.
- **Pricing.** Recurring subscriptions replace large upfront license purchases.
- **Access.** Users log in from any device with a browser.

## Key metrics

SaaS businesses are managed through recurring revenue measures:

- **MRR / ARR.** Monthly or annual recurring revenue.
- **Churn.** The share of customers or revenue lost in a period. Revenue churn is the more useful number, because losing large accounts hurts more.
- **Net revenue retention (NRR).** Revenue from existing customers after upgrades, downgrades, and cancellations. Above 100 percent means the existing base grows without new sales.
- **CAC and LTV.** Customer acquisition cost compared with customer lifetime value. A common rule of thumb is an LTV-to-CAC ratio of about 3 or higher.

## Common pricing models

- **Per seat.** Price scales with the number of users.
- **Usage-based.** Price scales with consumption, such as API calls or storage.
- **Tiered.** Fixed packages with different feature sets.
- **Freemium.** A free tier that converts some users to paid plans.

## Multi-tenancy

Most SaaS products serve many customers from shared infrastructure. Each customer is a tenant. The main design choices are:

- **Shared database, shared schema.** Cheapest to run. Every table carries a tenant ID, and every query must filter by it.
- **Shared database, separate schemas.** Better isolation with moderate cost.
- **Separate databases.** Strongest isolation, often required by large or regulated customers, and more expensive to operate.

Tenant isolation is a security requirement, not just a design preference. A missing tenant filter can expose one customer's data to another.

## Operational concerns

- Uptime commitments, usually written as a service level agreement (SLA)
- Data backup, retention, and recovery
- Onboarding and self-service setup
- Support tiers and response times
