# Domain: Engineering Manager Metrics

## Purpose

Metrics help an engineering manager see where a team is slowing down, where quality is slipping, and whether the team is healthy. They start conversations. They are not a score for individuals. Used badly, metrics encourage gaming, so measure teams and systems, not people.

## The five groups

| Group | Question it answers | Main measures |
|---|---|---|
| Delivery (DORA) | How fast and how safely do we ship? | Deployment frequency, lead time, change failure rate, time to restore |
| Flow | Where does work get stuck? | Cycle time, work in progress, throughput, review wait time |
| Quality and incidents | Are we creating problems for users? | Escaped defects, incident count and duration, rework |
| Team health | Can the team keep this pace? | Engagement, on-call load, overtime, attrition |
| Planning | Can we predict our own work? | Forecast accuracy, carry-over |

Start with one measure from delivery and one from flow. Add the others when a specific question needs them.

## Read the metrics together

No single metric tells the story. A common pattern:

- Deployment frequency rises, but change failure rate also rises. The team is shipping faster than it can test.
- Cycle time falls, but on-call load climbs. Work is being rushed through review, and incidents are absorbing the time saved.
- Throughput holds steady while work in progress keeps growing. Tasks are being started but not finished.

Look for the combination before you act on any one number.

## Deep dives

- **[DORA metrics](/Domain/DORA-Metrics).** The four delivery measures, with targets and the traps in measuring them.
- **[Flow metrics](/Domain/Flow-Metrics).** Cycle time, WIP, throughput, and Little's Law.
- **[Quality and incident metrics](/Domain/Quality-and-Incident-Metrics).** Defects, incident response, and rework.
- **[Team health metrics](/Domain/Team-Health-Metrics).** Signals that warn before delivery slips.
- **Tracking metrics in real time.** How to collect these numbers automatically, with realtime examples from a sample team.

## Guidelines for using metrics

- Pick a few metrics that answer a specific question, then review them on a fixed schedule.
- Show trends over time. A single data point proves little.
- Write down each definition, and agree on it with the team before measuring.
- Pair numbers with the reasons behind them. Talk to people before drawing conclusions.
- Avoid individual rankings. They reward the wrong behavior.
- Retire a metric once it stops informing decisions.
