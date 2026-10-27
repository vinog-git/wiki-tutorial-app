# Domain: Managed Services

## What it is

A managed service is one where a provider takes over the operation of a system, platform, or function on behalf of a customer. The provider runs it day to day, and the customer pays for the outcome, usually under a contract with defined service levels.

Managed services cover many areas:

- **Infrastructure.** Servers, networks, storage, and cloud accounts (managed hosting, managed cloud)
- **Platforms.** Databases, Kubernetes clusters, message queues (managed databases, managed Kubernetes)
- **Applications.** Support, maintenance, and enhancements of a business application
- **Operations.** Monitoring, incident response, security operations, and backups

## Typical responsibilities

- Provisioning and configuration
- Patching and upgrades
- Monitoring and alerting, often 24x7
- Incident response and escalation
- Backup, disaster recovery testing, and capacity planning
- Reporting against service levels

## Service level agreements

The contract defines what "good" means. Common elements:

- **Availability.** For example, 99.9 percent uptime per month. Each extra nine is harder and more expensive.
- **Response time.** How quickly the provider acknowledges an incident, by severity.
- **Resolution time.** How quickly the incident is fixed or worked around.
- **Service credits.** Refunds or discounts when targets are missed.

Read the exclusions carefully. Planned maintenance and customer-caused incidents are often excluded from the calculation.

## Pricing models

- **Fixed monthly fee.** Predictable, with a defined scope.
- **Per unit.** Priced per server, user, or device.
- **Time and materials.** Billed by effort, used for work outside the standard scope.
- **Outcome-based.** Tied to a result, such as a target uptime.

## Customer and provider responsibilities

Many failures happen at the boundary. The contract should state who owns:

- Application code and its bugs
- Data and access control
- Change requests and approvals
- Security patches for custom software
- Cost of cloud resources

A shared responsibility model is standard in cloud services. The provider secures the platform, and the customer secures what they put on it.

## Making a managed service work

- Clear runbooks and escalation paths
- Shared dashboards so both sides see the same status
- Regular service reviews against the SLA
- A documented exit plan, including data export, in case the relationship ends
