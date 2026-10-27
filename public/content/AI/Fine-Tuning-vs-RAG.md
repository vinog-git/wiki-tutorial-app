# AI: Fine-Tuning vs RAG vs Prompting

## The three ways to adapt a model

When a model does not do what you need, you have three main options. They solve different problems, and choosing the wrong one wastes time and money.

- **Prompting.** Change the instructions and examples you send with each request. No training, and changes take effect at once.
- **RAG.** Retrieve relevant passages from your data at request time and include them in the prompt. The model learns nothing new; it reads your data when asked.
- **Fine-tuning.** Train the model's weights on examples of the behavior you want. The change is baked into the model.

## Which problem each one solves

| Problem | Best fit | Why |
|---|---|---|
| The model ignores your format or tone | Prompting | Format and tone are instructions |
| The model does not know your product documents | RAG | Facts change, and documents need citations |
| The model must answer from policy text that updates weekly | RAG | Re-indexing is cheap; retraining is not |
| The model must follow a specialized output format reliably, with many examples | Fine-tuning | Consistent behavior across many inputs |
| The model needs a specific writing style learned from thousands of examples | Fine-tuning | Style is hard to describe in a prompt |
| The model must call your tools correctly | Prompting plus good tool descriptions first | Fine-tuning helps only after prompting is exhausted |

## Start with prompting

Prompting is the cheapest and fastest option, and most teams should exhaust it first. Write clear instructions, add two or three examples, and specify the output format. Measure the result with an evaluation set. See Prompt Engineering and LLM Evaluation.

If prompting reaches a plateau, the failure type tells you the next step:

- **Missing facts** point to RAG.
- **Consistent style or format failures across many inputs** point to fine-tuning.
- **Reasoning failures on a task the base model cannot do** may need a larger model, not fine-tuning.

## When RAG is the right choice

- The information changes often, such as prices, stock, or policies
- You need citations, so people can check the source
- The data is large, and you cannot fit it all in the context window
- Access control matters, because retrieval can filter by user permissions and fine-tuning cannot

RAG does not teach the model new skills. If the model cannot follow your format at all, retrieval will not fix that.

## When fine-tuning is the right choice

- The behavior must be consistent across thousands of inputs, and prompts are too long or fragile
- You need a smaller, cheaper model to match a larger model's results on one narrow task
- The desired style or format is hard to describe but easy to show with examples

Fine-tuning needs data, typically hundreds to thousands of input and output pairs that are correct. Poor examples produce a poor model, and the model cannot cite where it learned something.

## Trade-offs

| | Prompting | RAG | Fine-tuning |
|---|---|---|---|
| Time to first result | Minutes | Hours | Days |
| Cost to change | Edit text | Re-index documents | Retrain |
| Knowledge freshness | Only what you paste | As fresh as the index | Frozen at training time |
| Citations | Only if you add them | Built in | Not available |
| Data needed | A few examples | Your documents | Hundreds to thousands of examples |
| Risk of stale behavior | Low | Low | Higher, since it must be retrained |

## Combining them

These approaches combine well. A common production setup:

1. A clear system prompt sets the role, rules, and output format.
2. RAG supplies the current facts with citations.
3. Fine-tuning, if used at all, teaches a narrow output format or a small model a specific task.

Add each layer only when measurement shows it is needed.

## A decision checklist

1. Can a better prompt, with examples, fix it? Try this first.
2. Is the problem missing knowledge? Add RAG.
3. Is the problem consistent behavior across many inputs that prompts cannot hold? Consider fine-tuning.
4. Did the change work? Measure it on the same evaluation set as before.

Fine-tuning is often chosen too early because it sounds like the most powerful option. In practice, most teams get further with better prompts and better retrieval.
