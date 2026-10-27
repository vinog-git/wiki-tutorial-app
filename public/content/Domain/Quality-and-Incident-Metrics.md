# Domain: Quality and Incident Metrics

## Purpose

Delivery speed means little if users hit bugs. Quality metrics show whether the team is creating problems faster than it fixes them. Track them as trends, and review each incident for what it teaches, not who caused it.

## Escaped defects

A defect that reaches production after the team's testing and review processes.

- **Measure:** count of bugs created in production per period, grouped by severity.
- **Source:** the bug tracker, filtered to bugs found after release.
- **Use:** compare against the number of changes shipped. Ten bugs from 200 changes is a different story from ten bugs from twenty changes.

## Incident metrics

| Measure | Definition | What it shows |
|---|---|---|
| Incident count | Production incidents per month, by severity | Overall stability |
| Mean time to detect (MTTD) | Time from fault start to alert | Monitoring quality |
| Mean time to acknowledge (MTTA) | Time from alert to a person responding | On-call responsiveness |
| Mean time to restore (MTTR) | Time from fault start to service restored | Recovery capability |

Use medians alongside means. One large outage can dominate an average.

MTTD is often the most useful for improvement. If the team learns about outages from customers, the fix is better alerting, not faster responders.

## Change failure rate in practice

Change failure rate from DORA is the quality signal most tied to deployment. Count a deploy as failed when it causes an incident or a rollback within a defined window. Agree on the window, such as 24 hours, and the severity that counts.

## Rework rate

Rework is work done again soon after it was shipped. It is the hidden cost of quality problems.

- **Measure:** items reopened or bug-fixed within 30 days of being marked done, divided by all items done.
- **Use:** a rising rework rate often means requirements are unclear or testing is too thin for the change size.

## Test health

- **Flaky test rate.** Share of test runs that fail and then pass on rerun. High flakiness trains people to ignore failures.
- **Test suite duration.** Long suites slow feedback and push people to skip tests.
- **Coverage trend.** Watch direction, not the number. A falling trend on new code is the warning sign.

## Incident reviews

After each significant incident, write a short review with:

1. Timeline of what happened and when it was detected
2. Impact on users, in numbers
3. The contributing causes, without blaming individuals
4. Actions, each with an owner and a due date

Track how many review actions were completed on time. An incident process that generates actions nobody finishes is not learning.

## Warning signs

- The same incident type returns each quarter.
- Severity keeps rising while total incident count stays flat.
- Reviews finish but their actions stay open for months.

For how to collect these from your tools, see Tracking metrics in real time.
