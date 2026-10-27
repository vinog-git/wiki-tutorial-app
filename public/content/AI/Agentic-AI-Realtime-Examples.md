# AI: Agentic AI Realtime Examples

These examples show agents working on live events: a customer message arriving, an alert firing, a pull request opening. Each one includes the trigger, the tools, a timeline of the steps, and the points where a person must approve. The timelines are illustrative, built to match the loop in the RAG lab, and the timings are typical rather than measured.

Read them with one question in mind: at which step would this agent go wrong, and how would we know?

## Example 1: Live customer support on the website chat

**Trigger:** a customer types into the website chat at 19:42 on a Tuesday.

**Tools:** `search_knowledge` (policy documents), `lookup_order` (order records), `get_product` (stock), and `create_return_label` (write action, approval required).

**Customer message:** "My Trail Jacket arrived with a torn zip. Can I get a replacement, and what do I do with the old one?"

| Time | Step | What happens |
|---|---|---|
| 19:42:00.0 | Trigger | Message received, session id attached |
| 19:42:00.4 | Model call 1 | Model chooses `search_knowledge` with "damaged item replacement" |
| 19:42:00.9 | Tool | Returns the damaged-item section of the returns policy: 14-day window, free replacement |
| 19:42:01.6 | Model call 2 | Asks the customer for the order id, since it is needed to check eligibility |

The agent stops here and asks for the order number. It does not guess one. Once the customer replies with `NW-1042`:

| Time | Step | What happens |
|---|---|---|
| 19:43:12.1 | Model call 3 | Chooses `lookup_order` with `NW-1042` |
| 19:43:12.5 | Tool | Returns status shipped on 2026-10-11, with no delivered date recorded |
| 19:43:13.0 | Model call 4 | Chooses `get_product` for `NW-JKT-001` to confirm stock |
| 19:43:13.4 | Tool | Returns stock 24 |
| 19:43:14.2 | Model call 5 | Proposes a replacement and a return label, and notes that the record has no delivery date, so the support agent must confirm delivery first |

**Human approval point:** `create_return_label` is a write action. Your code pauses the agent and shows the support agent the proposed label, the order, the reason, and the missing delivery date. The support agent confirms delivery with the customer and approves in one click.

**What to log:** each tool name, arguments, result size, and the approval decision. If the customer later disputes the label, this trace is the record.

**Where it goes wrong:** the agent might search the wrong policy section and quote the 45-day return window, which applies to unworn items, not damaged ones. A regular evaluation case with a damaged-item question catches this.

## Example 2: Incident triage from an alert

**Trigger:** the monitoring system fires `PaymentsErrorRateHigh` at 02:14, with error rate at 8 percent against a threshold of 2 percent.

**Tools:** `query_metrics` (read-only), `get_recent_deploys` (read-only), `get_runbook` (search over runbooks), and `page_oncall` (write action, low-risk, rate limited).

The agent does not fix anything. Its job is to gather facts and write a summary for the on-call engineer, so the engineer starts with a diagnosis instead of a blank screen.

| Time | Step | What happens |
|---|---|---|
| 02:14:03 | Trigger | Alert payload received |
| 02:14:05 | Call 1 | `query_metrics` for error rate by endpoint, last 30 minutes |
| 02:14:06 | Result | Errors concentrated on `/charge`, starting 02:09 |
| 02:14:07 | Call 2 | `get_recent_deploys` for payments-api, last 2 hours |
| 02:14:08 | Result | Deploy of version 2.14.0 at 02:08 |
| 02:14:10 | Call 3 | `get_runbook` with "charge endpoint errors after deploy" |
| 02:14:11 | Result | Runbook says: check the payment provider status page, then roll back if the deploy is recent |
| 02:14:16 | Summary | Agent posts to the incident channel |

The summary:

> Error rate on /charge rose from 0.1 to 8 percent at 02:09, five minutes after payments-api 2.14.0 deployed at 02:08. The runbook recommends checking the provider status page first, then rolling back. I have not made any changes. Suggested next step: roll back to 2.13.4, which is the last version without errors.

**Human approval point:** rollback is not in the agent's tool list. The agent suggests it, and the engineer runs it. Keeping destructive actions out of the agent's tools is a deliberate design choice.

**Where it goes wrong:** if the deploy at 02:08 was unrelated and the cause is the payment provider, the agent may anchor on the deploy. Its summary must show the evidence for each claim so the engineer can check it in seconds.

## Example 3: Pull request review assistant

**Trigger:** a developer opens pull request #482, which changes the tenant filter in a reporting query.

**Tools:** `get_pr_diff` (read-only), `get_file` (read-only), `search_code` (read-only), and `post_review_comment` (write action, draft mode only).

The agent posts draft comments. A human reviewer decides which ones to publish.

Typical run, about 40 seconds in total:

1. `get_pr_diff`: 3 files changed, 112 lines added.
2. `search_code` for every call site of the changed function, finds 6 callers.
3. `get_file` for two callers that were not in the diff.
4. Drafts one comment: "Caller `export_monthly_report` passes no tenant id after this change. The filter now defaults to all tenants. Add a test with two tenants."

**Human approval point:** the reviewer reads the draft, edits it, and publishes. Nothing is posted automatically.

**Where it goes wrong:** the agent can miss a caller that lives outside the repository, such as a service in another repo that uses the same database view. The review note should say what it could not check.

## Example 4: Morning operations digest

**Trigger:** a scheduled job at 08:00 on weekdays.

**Tools:** `get_open_incidents`, `get_sla_breaches`, `get_queue_depth`, and `post_message` (write action, to one channel only).

The agent runs unattended, so its limits matter most here. It has a step budget of 8, a timeout of 60 seconds, and can post only to the operations channel.

Sample output at 08:00:41:

> Good morning. Three open incidents: one sev-2 (payments latency, acknowledged), two sev-3. One SLA breach yesterday on ticket #7731, now resolved. Support queue depth is 42, up from 18 at the same time last Tuesday. Likely cause: the Monday release of the help center.

**Where it goes wrong:** the "likely cause" line is a guess, and the agent should label it as one. Digest readers trust summaries quickly, so the digest should link to the tool results behind every number.

## What the examples have in common

- **The trigger starts the run.** An event, a message, or a schedule. Nobody types a prompt.
- **Reads are cheap and writes are gated.** Read-only tools run freely. Anything that changes state goes through a person or a rule.
- **Each step is logged.** Tool, arguments, result, timing, and the decision that led to the next step.
- **Limits are explicit.** Step count, time, and channel scope are set in code.
- **The output says what it could not check.** Honest gaps are more useful than confident guesses.

## Logging a realtime trace

Every example above depends on a trace. At minimum, record one line per event:

```json
{"ts": "2026-10-27T02:14:10.412Z", "run": "inc-7731", "step": 3, "type": "tool_call",
 "tool": "get_runbook", "args": {"query": "charge endpoint errors after deploy"},
 "result_bytes": 412, "ms": 118}
```

Keep the run id on every line. Then one query can rebuild any run, and one dashboard can show how many runs ended at a limit, how often a write was rejected, and which tool was slowest.

## What to log at each step, by workflow

Log the same core fields everywhere: run id, timestamp, step number, event type, and duration. Add the workflow-specific fields below, so each trace answers the questions a reviewer would ask.

### Support chat

| Step | Log these fields | Why |
|---|---|---|
| Trigger | session id, channel, customer id (hashed), message length | Links the run to the conversation and the customer |
| Model decision | chosen tool, argument values, token counts | Shows why the agent acted, and what it cost |
| Tool call | tool name, order or SKU id, result size, status | Confirms the agent checked the right record |
| Clarifying question | the question asked, and whether the customer answered | Measures how often the agent needs to ask |
| Approval request | proposed action, amount or label, approver id | Proves a person saw the action before it ran |
| Approval result | approved or rejected, reason, time to decision | Tracks how long customers wait for a decision |
| Final reply | reply length, tools cited, whether a human took over | Lets you audit what the customer was told |

Do not log the full message text by default. Store it under a separate retention rule if you need it for disputes.

### Incident triage

| Step | Log these fields | Why |
|---|---|---|
| Trigger | alert id, rule name, threshold, observed value | Ties the run to the alert that started it |
| Metric query | query text, time window, number of series returned | Makes the evidence reproducible |
| Deploy check | service, version, deploy time | Shows the timeline the agent relied on |
| Runbook lookup | query, runbook id, section returned | Confirms which procedure was suggested |
| Page or notify | recipient, channel, rate-limit state | Tracks noise and duplicate pages |
| Summary posted | summary text, list of evidence ids, word count | Lets the on-call engineer check each claim |
| Run end | outcome (summary posted, step limit, timeout), total time | Shows whether the agent finished in time |

Also log the time from alert to summary. That number tells you whether the agent is useful at 02:00, when a person is slowest to respond.

### Pull request review

| Step | Log these fields | Why |
|---|---|---|
| Trigger | pull request number, repository, commit sha | Makes the review reproducible for that commit |
| Diff fetch | files changed, lines added and removed | Shows the scope the agent actually saw |
| Code search | query, number of call sites found | Reveals whether the agent looked beyond the diff |
| File read | file path, whether it was in the diff | Separates reading context from reviewing changes |
| Comment draft | file, line, comment text, confidence note | Lets reviewers see which drafts they kept |
| Reviewer action | published, edited, or discarded, per comment | The most useful signal for improving the agent |
| Run end | comments drafted, what could not be checked | Records the known gaps in the review |

Track the share of drafted comments that reviewers publish unchanged. A low share means the agent is noisy, and its prompt or search scope needs work.

### Shared rules across all three

- **Never log secrets.** Tokens, passwords, and full card or bank numbers stay out of traces, even if a tool returned them.
- **Log denials as well as successes.** A rejected write or a blocked tool call is one of the most useful events for security review.
- **Keep the run id on every line,** so one query rebuilds a complete run.
- **Set retention by workflow.** Support traces may hold customer data and need a shorter retention period than incident traces.

For the setup behind these loops, see [Agentic AI Setup](/AI/Agentic-AI-Setup). For how to test them before they run live, see [LLM Evaluation](/AI/LLM-Evaluation).
