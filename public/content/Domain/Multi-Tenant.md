# Domain: Multi-Tenant

## What it is

Multi-tenancy is an architecture where one running instance of a software system serves many customers, called tenants. Each tenant's data and configuration are kept separate, even though the infrastructure is shared. Most SaaS products are multi-tenant.

## Why it matters

- **Cost.** Shared infrastructure is cheaper per customer than a full deployment for each one.
- **Operations.** One system to deploy, monitor, and upgrade.
- **Speed.** New customers are onboarded by creating a tenant, not by provisioning servers.

The cost is complexity. Every feature must respect tenant boundaries, and a single mistake can expose one customer's data to another.

## Tenancy models

- **Shared database, shared schema.** All tenants share the same tables. Each row carries a `tenant_id`, and every query filters by it. Lowest cost and easiest to scale across many small tenants.
- **Shared database, separate schemas.** Each tenant has its own schema inside one database. Stronger isolation, with more migration work.
- **Separate databases.** Each tenant has its own database. Strongest isolation and easiest per-tenant backup and restore, but the most expensive to run at scale.
- **Hybrid.** Small tenants share, and large or regulated tenants get dedicated resources.

## Tenant identification

The system must work out which tenant a request belongs to. Common approaches:

- A subdomain, such as `acme.example.com`
- A path prefix, such as `/acme/...`
- A claim in the authentication token, such as a tenant ID in the JWT

Resolve the tenant once, early in the request, and carry it through the request context. Do not let each function look it up again.

## Keeping tenants isolated

- **Enforce at the data layer.** Use row-level security in the database, or a repository layer that always adds the tenant filter. Relying on each developer to remember the filter is not enough.
- **Scope caches and queues.** Cache keys, message topics, and background jobs must include the tenant ID.
- **Scope files and storage.** Object storage paths should be prefixed by tenant.
- **Test it.** Write tests that create two tenants and confirm that one cannot read or modify the other's data.

## Operational concerns

- **Noisy neighbors.** One heavy tenant can slow everyone down. Set per-tenant rate limits and resource quotas.
- **Per-tenant configuration.** Feature flags, branding, and limits should be stored per tenant, not hard-coded.
- **Migrations.** Schema changes apply to all tenants. Plan for large tables and for rolling back safely.
- **Backup and restore.** Decide whether you need to restore one tenant without affecting the others. Shared schemas make this harder.
- **Data residency.** Some customers require data in a specific region, which may force a separate deployment.

## Relation to B2B

Enterprise buyers often ask how their data is isolated from other customers. A clear answer about tenancy model, isolation testing, and per-tenant controls is part of closing those deals. See B2B and SaaS for related topics.
