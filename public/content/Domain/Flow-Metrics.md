# Domain: Flow Metrics

## The idea

Flow metrics describe how work moves through the team, from the moment it starts to the moment it is done. They show where work waits. Most delivery delays are waiting time, not working time.

## Cycle time

Cycle time is the elapsed time from when work starts to when it is done. "Starts" means someone began active work, not when the ticket was created.

- **Measure:** `done_date - started_date`, per item.
- **Report:** the median and the 85th percentile. The average is distorted by a few very long items.
- **Use:** a rising 85th percentile means some work is getting stuck, even if the median looks fine.

Example from a sample team over one month:

| Measure | Value |
|---|---|
| Median cycle time | 3 days |
| 85th percentile | 9 days |
| Items over 14 days | 4 of 62 |

The four long items are the ones to review. They usually share a cause, such as waiting for an external API or a blocked approver.

## Work in progress (WIP)

WIP is the number of items started and not yet finished.

- **Measure:** count of items in "in progress" status at a point in time.
- **Use:** a WIP limit per person or per team. Limit it to a number the team can really finish, often one or two items per person.

## Little's Law

For a stable system, the average time an item spends in the system equals the WIP divided by the throughput:

> average cycle time = average WIP ÷ average throughput

Example: a team has 12 items in progress and finishes 4 per week. The average cycle time is 12 ÷ 4 = 3 weeks. To cut cycle time to 1.5 weeks with the same throughput, the team must reduce WIP to 6.

This is why starting more work does not make a team faster. It makes every item slower.

## Throughput

Throughput is the number of items finished per period.

- **Measure:** count of completed items per week.
- **Use:** plan with a range. Use the last 8 to 12 weeks to estimate how many items the team can finish next week.
- **Warning:** do not set a throughput target. Teams will split items to hit the number, and the numbers will look better while the value falls.

## Pull request review time

Time from a PR being opened to its first review. For many teams this is the largest single wait in the flow.

- **Measure:** time from PR opened to first review comment or approval.
- **Target idea:** most PRs get a first review within a few working hours.
- **Use:** if this number is high, the fix is usually a review rota, smaller PRs, or agreed review times, not more pressure on individuals.

## Reading a cumulative flow diagram

A cumulative flow diagram (CFD) stacks the count of items in each state over time.

- Bands should stay roughly parallel. A widening band means work is piling up in that state.
- A flat band for many days means no items moved out of that state.
- The gap between "started" and "done" is WIP. A growing gap means cycle time is rising.

For how to build this from live data, see Tracking metrics in real time.
