# AI: Agentic AI

## What it means

A plain LLM call takes text in and returns text out, once. An agent is a system where a model runs in a loop: it decides what to do next, uses tools to act, observes the results, and continues until the goal is met or it stops.

## The core loop

1. **Goal.** The user states an objective.
2. **Plan.** The model decides the next step.
3. **Act.** It calls a tool, such as a search, a database query, a file write, or an API request.
4. **Observe.** The tool result is added to the context.
5. **Repeat or finish.** The model continues until it has an answer or hits a limit.

## Building blocks

- **Model.** The reasoning engine. Models with strong tool-use behavior work better.
- **Tools.** Functions the model can call, described with a name, a purpose, and typed parameters. See function calling and tools.
- **Memory.** Short-term memory is the conversation context. Long-term memory is usually a store that is searched when needed, often backed by RAG.
- **Protocol.** A standard way to expose tools to agents. See MCP.
- **Orchestration.** The code that runs the loop, enforces limits, and handles errors.

## Single agent or multi-agent

A single agent with good tools covers most cases. Multiple agents help when work splits into clearly separate roles, such as a researcher, a coder, and a reviewer. Each extra agent adds cost, latency, and coordination failures, so start with one.

## Guardrails you need

- **Step limits and budgets.** Cap the number of iterations, tokens, and time. Without a cap, a loop can run for a long time.
- **Least privilege.** Give each tool only the access it needs. Make write or delete actions require approval.
- **Validation.** Check tool arguments before executing them.
- **Human in the loop.** Pause for confirmation before irreversible actions such as sending email or deploying.
- **Logging.** Record every model decision and tool call so failures can be traced.

## Common failure modes

- **Looping.** The agent repeats the same failing call.
- **Hallucinated tool results.** The model claims an action succeeded without calling the tool.
- **Goal drift.** The agent works on a sub-task and loses the original goal.
- **Prompt injection.** Content from a web page or document tells the agent to do something harmful. Treat all tool output as untrusted data.

## Evaluating agents

Test with a fixed set of tasks and record success rate, steps taken, cost, and failure type. Small changes to prompts or tool descriptions can change behavior a lot, so re-run the set after every change.
