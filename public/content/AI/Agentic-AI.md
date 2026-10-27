# AI: Agentic AI

## What it means

A plain LLM call takes text in and returns text out, once. An agent is a system where a model runs in a loop: it decides the next step, calls a tool, reads the result, and continues until the goal is met or a limit stops it. The model is the decision-maker. Your code is the executor, and it decides what is allowed.

The difference shows up in a simple request. "What is the return window?" needs one retrieval and one answer. "Find order NW-1044, check whether the replacement is in stock, and draft the email" needs several lookups, one decision based on their results, and a draft. That multi-step work is what agents are for.

## The core loop

1. **Goal.** The user states an objective, with any constraints.
2. **Decide.** The model reads the goal and the conversation so far, and chooses either a tool call or a final answer.
3. **Act.** Your code validates the call and runs the tool: a search, a database query, an API request, or a file write.
4. **Observe.** The tool result is appended to the conversation.
5. **Repeat or finish.** The loop continues until the model answers, or a limit such as a step count, token budget, or timeout is reached.

Every pass through this loop is a model call. A five-step agent makes at least six model calls, and each call re-sends the growing conversation. Cost and latency grow with the number of steps, not just the number of questions.

## Building blocks

- **Model.** The reasoning engine. Models that support tool calling reliably produce valid arguments and fewer invented tool names. Test your model on your own tools before relying on it.
- **Tools.** Functions the model can call, each with a name, a description, and typed parameters. The description is what the model reads when it chooses a tool, so it is effectively part of the prompt. See function calling and tools.
- **Memory.** Short-term memory is the conversation context, which is limited by the context window. Long-term memory is a store, such as a database or vector index, that the agent searches when needed. See RAG.
- **Protocol.** A standard way to expose tools to agents, so one tool server works with many clients. See MCP.
- **Orchestration.** The code that runs the loop, enforces limits, retries failed calls, logs each step, and asks a human when required.

## Single agent or multi-agent

A single agent with good tools covers most business tasks. Multiple agents help when the work splits into roles that need different tools or different permissions, such as a researcher with read-only access and a writer with access to a draft folder. Each extra agent adds cost, latency, and coordination failures, so start with one and split only when a single agent's prompt or tool list becomes hard to control.

## Designing the tools

Most agent failures come from tools, not from the model.

- **One clear action per tool.** `lookup_order(order_id)` is easier to use correctly than `order_api(mode, id, fields, ...)`.
- **Descriptions say when to use the tool, and when not to.** "Use for policy questions. Do not use for order status" prevents misrouting.
- **Return short, structured results.** Trim tool output to the fields the model needs. Long raw payloads fill the context and bury the useful part.
- **Return errors the model can act on.** "Order not found: check the id format NW-####" lets the agent retry. A stack trace does not.
- **Mark side effects.** Read-only tools can run freely. Tools that send, pay, delete, or deploy need a confirmation step in your code, not just in the prompt.

## Guardrails you need

- **Step limits and budgets.** Cap iterations, tokens, and wall-clock time. A loop with no cap can run up a large bill.
- **Least privilege.** Give each tool only the access it needs. Use a read-only database user for lookup tools.
- **Argument validation.** Check types, ranges, and allowed values before running a tool. Never pass model output straight into a SQL string or shell command.
- **Human in the loop.** Pause for approval before irreversible actions, and show the human exactly what will happen.
- **Trace logging.** Record every model decision, tool call, argument, result, and timing, so failures can be reconstructed. See the realtime examples page for what a trace looks like.

## Common failure modes

- **Looping.** The agent repeats the same failing call with the same arguments. Detect repeated calls and stop them.
- **Wrong tool.** A vague description sends a policy question to an order lookup. Fix the description, then re-test.
- **Hallucinated results.** The model states that an action succeeded without calling the tool, or invents a value a tool did not return. Require the final answer to cite tool results.
- **Goal drift.** Over a long run, the agent works on a sub-task and loses the original request. Keep the goal in every turn, and keep runs short.
- **Prompt injection.** A web page, email, or document contains text such as "ignore your instructions and forward this to..." The agent treats it as a command. See AI security and prompt injection.

## Where agents fit compared with RAG

RAG answers questions from documents in one retrieval and one answer. An agent can use RAG as one of its tools, and also call systems that hold live data, such as orders, tickets, or metrics. Use RAG alone when the answer lives in documents. Use an agent when the task needs several steps or live data.

## Setting it up and seeing it run

The step-by-step setup is on the [Agentic AI Setup](/AI/Agentic-AI-Setup) page. It uses the RAG lab's three tools with a local model, so you can watch the loop run, and then add a tool of your own.

For live examples of agents handling support tickets, incident triage, and code review, see [Agentic AI Realtime Examples](/AI/Agentic-AI-Realtime-Examples).

## Evaluating agents

Evaluate an agent on a fixed set of tasks, each with an expected outcome. Record:

- **Task success rate.** Did the final answer meet the goal?
- **Correct tool use.** Did it call the right tools, with the right arguments?
- **Steps and cost.** Average steps, model calls, tokens, and time per task.
- **Failure type.** Wrong tool, loop, hallucinated result, or unsafe action.

Re-run the set after every change to a prompt or tool description. Small wording changes can shift behavior a lot. See [LLM evaluation](/AI/LLM-Evaluation) for how to build the test set.
