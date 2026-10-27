# Domain: DORA Metrics

## Where they come from

The DORA research program, now part of Google Cloud, surveyed thousands of software teams over many years. It found four measures that separate high-performing delivery teams from the rest. Later reports added reliability as a fifth area. The four core measures are below.

## The four measures

### 1. Deployment frequency

How often the team deploys code to production.

- **Measure:** count of successful production deployments per day or per week.
- **High performers (DORA benchmark):** on demand, often several times per day.
- **Trap:** counting deployments to staging, or counting deploys that were rolled back immediately. Count only production deploys that stayed live.

### 2. Lead time for changes

How long it takes from a code change being committed to that change running in production.

- **Measure:** time from first commit (or PR open) to production deploy, per change.
- **High performers:** less than one day.
- **Trap:** starting the clock at ticket creation. That measures backlog wait, not delivery.

### 3. Change failure rate

The share of production deployments that cause a degradation needing a hotfix, rollback, or patch.

- **Measure:** failed deploys divided by total deploys over the same period.
- **High performers:** roughly 0 to 15 percent.
- **Trap:** deciding what counts as a failure. Agree on it in writing, for example "any deploy followed by a sev-1 or sev-2 incident within 24 hours."

### 4. Time to restore service

How long it takes to recover when a production failure happens.

- **Measure:** time from incident start to service restored, median per incident.
- **High performers:** less than one hour.
- **Trap:** averaging. One long outage can hide many quick fixes. Use the median and list the longest incidents separately.

## Why speed and stability are not opposites

The DORA findings show that teams with faster deployment and shorter lead time also have lower change failure rates. Small batches are easier to test and easier to roll back. Improving the four measures usually means cutting batch size, automating tests, and making rollback routine.

## Targets for a typical team

Targets depend on the starting point. A reasonable first goal for a team deploying weekly:

- Move to deploying twice a week within a quarter.
- Cut median lead time from about a week to under two days.
- Keep change failure rate under 15 percent while frequency rises.

Set targets as direction, not as a pass or fail line.

## Common mistakes

- Comparing DORA numbers across teams with different products and risk levels.
- Counting a deploy as successful before the monitoring window passes.
- Measuring only the pipeline and ignoring how long code waits in review.
- Using the numbers in performance reviews. This pushes teams to game the definitions.

For how to collect these automatically, see Tracking metrics in real time.
