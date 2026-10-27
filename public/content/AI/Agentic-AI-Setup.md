# AI: Agentic AI Setup

This guide sets up a working agent on your machine, watches it make decisions, then adds a new tool and checks that the agent uses it. It builds on the RAG lab and the Ollama setup, so complete those first.

## What you need

- Ollama running, with `llama3.2` pulled (tool calling support is required)
- The `rag-lab` project, with its offline tests passing
- Python 3.10 or later, and no extra packages

Check the model first:

```bash
ollama pull llama3.2
ollama run llama3.2 "Reply with the word ready."
```

## Step 1: Confirm the agent runs

From the `rag-lab` folder:

```bash
python3 rag_lab.py agent "Where is order NW-1044, and how many Harbor Totes are in stock?"
```

You should see, in order:

1. A tool call to `lookup_order` with `NW-1044`, then its result
2. A tool call to `get_product` with `NW-BAG-220`, then its result
3. A final answer that uses both results

If the agent answers without calling any tool, the model may not support tool calling, or it may be too small. Try a different model with `CHAT_MODEL=<name>`.

## Step 2: Read the loop in code

Open `rag_lab.py` and find `run_agent`. The loop has five lines that matter:

```python
message = chat(messages, TOOL_SCHEMAS)   # 1. the model decides
messages.append(message)
tool_calls = message.get("tool_calls") or []
if not tool_calls:                        # 2. no tool requested: this is the answer
    return message.get("content", "")
for call in tool_calls:                   # 3. your code runs each requested tool
    result = run_tool(name, args, index)
    messages.append({"role": "tool", "content": result})   # 4. result goes back into context
```

The loop runs until the model stops requesting tools, or until `max_steps` is reached. Find that limit and confirm it is 5 by default.

## Step 3: Watch the decisions

Run a question that needs a policy answer and a live lookup together:

```bash
python3 rag_lab.py agent "Can I still return a Ridge Boots order if I bought it on 1 October?"
```

Note the sequence of tool calls. A good run searches the returns policy, and may check the order date. Compare the tool arguments with what you asked. If the model passed a wrong order id or query, that is a prompt or description problem, not a code bug.

## Step 4: Add a new tool

Add a tool that finds the shipping address rule, so the agent can answer a delivery question without a search. This is a small change in three places.

1. **Write the function** in `rag_lab.py`, next to `get_product`:

   ```python
   def get_shipping_policy(region):
       """Return the shipping summary for a region. Simplified for the lab."""
       if region.lower() in {"us", "usa", "united states"}:
           return "Standard shipping: 3 to 5 business days. Expedited: 1 to 2 days for 15 dollars."
       return "No shipping policy found for that region."
   ```

2. **Describe it** by adding an entry to `TOOL_SCHEMAS`:

   ```python
   {
       "type": "function",
       "function": {
           "name": "get_shipping_policy",
           "description": "Get the shipping times and costs for a region, such as US.",
           "parameters": {
               "type": "object",
               "properties": {"region": {"type": "string"}},
               "required": ["region"],
           },
       },
   },
   ```

3. **Route it** in `run_tool`:

   ```python
   if name == "get_shipping_policy":
       return get_shipping_policy(str(args.get("region", "")))
   ```

Then run:

```bash
python3 rag_lab.py agent "How long does shipping take to the US?"
```

The agent should call `get_shipping_policy` with `US`. If it calls `search_knowledge` instead, the description is too similar to the shipping document. Make the new description more specific about what it returns.

## Step 5: Add a test for the new tool

Add this to `test_rag_lab.py` so the tool keeps working:

```python
def test_shipping_policy_us(self):
    self.assertIn("3 to 5", rag_lab.get_shipping_policy("US"))
```

Run `python3 -m unittest -v test_rag_lab`. Tests cover the tool code, not the model's choices. Test the choices with the evaluation set below.

## Step 6: Stop runaway loops

Set a smaller step limit to see the stop behavior:

```python
answer = run_agent(question, index, max_steps=2)
```

With a limit of 2, a question that needs three tools stops early with the message "Stopped: the agent did not finish within the step limit." In production, a stop like this should be logged and surfaced to a person, not hidden.

## Step 7: Build a small evaluation set

Write five tasks in a file, each with the expected tool and the expected fact in the answer:

| Task | Expected tool | Expected fact |
|---|---|---|
| Status of NW-1043 | lookup_order | processing |
| Stock of NW-SOX-003 | get_product | 136 |
| Return window | search_knowledge | 45 days |
| Shipping to US | get_shipping_policy | 3 to 5 business days |
| Office phone number | none (should say it does not know) | does not know |

Run each question, record the tools called and whether the fact appears. Track the pass rate across changes to prompts or descriptions. The last row checks that the agent does not invent an answer.

## Step 8: Use the same tools in Open WebUI

Open WebUI supports Python Tools, which are classes with typed methods that a model can call during a chat. The exact format can change between releases, so check the Tools section of the Open WebUI documentation for your version. A minimal tool wraps `lookup_order`:

```python
class Tools:
    def lookup_order(self, order_id: str) -> str:
        """Get the status of one order by its id, such as NW-1042."""
        from rag_lab import lookup_order
        return lookup_order(order_id)
```

Copy the file to the Tools area in Open WebUI, enable it for a chat, and ask about an order. Open WebUI runs the same loop as the lab. It just gives you a chat interface. Open WebUI runs the tool in its own Python environment, so the `rag_lab` import must be available there. For a quick test, paste the function body in directly instead.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No tool calls at all | Model without tool support | Use `llama3.2` or another model that supports tools |
| Wrong tool every time | Descriptions overlap | Make each description name what it returns |
| Arguments with the wrong format | Vague parameter description | Add an example value to the parameter description |
| Loop until the step limit | Tool result unclear, or wrong argument | Return clear errors such as "not found" with a hint |
| Slow answers | Each step is a full model call | Reduce tools per question, or use a smaller model |

## Next

Read the Agentic AI Realtime Examples page to see how these same loops run in support, incident, and review workflows, and what to log at each step.
