# AI: LLM Evaluation

## Why evaluate

A language model's answers vary with the wording of the question, the model version, the retrieved context, and the settings. A demo that works once tells you little. An evaluation tells you whether the system works across the range of real questions, and whether a change made things better or worse.

Without an evaluation, every prompt change is a guess. With one, you can measure it.

## What to measure

Split the question into parts, because each part fails for different reasons:

- **Retrieval quality (for RAG).** Did the system fetch the passage that contains the answer?
- **Answer correctness.** Does the answer state the right facts?
- **Groundedness.** Is every claim supported by the retrieved text or tool results?
- **Tool use (for agents).** Did it call the right tools with the right arguments?
- **Refusal behavior.** When the answer is not available, does it say so?
- **Cost and latency.** Tokens, model calls, and time per question.

A single "quality score" hides which part broke. Keep the measures separate.

## Build a test set

A useful test set has 30 to 100 cases to start, written from real questions your users ask. Each case has:

| Field | Example |
|---|---|
| Question | "How long do refunds take?" |
| Expected fact | "5 business days after the warehouse receives the return" |
| Source | returns-policy.md, Refunds section |
| Category | policy, lookup, refusal, adversarial |

Include cases the system should refuse, such as questions about a topic the documents do not cover. Include adversarial cases, such as prompt injection attempts (see AI Security and Prompt Injection).

Take real questions from support tickets, search logs, and chat history. Invented questions tend to be easier than real ones.

## Scoring

**Exact match** works for short facts: an order status, a number, a date. Check that the expected string appears in the answer.

**Keyword checks** work when the answer must include certain facts, such as "45 days" and "unworn."

**Model as judge.** A second model compares the answer with the expected fact and returns pass or fail. It is cheap and scales well, but it can be wrong. Check its verdicts by hand on a sample, and check that it uses a different model, or at least different settings, from the one being tested.

**Human review.** The gold standard, and the only reliable check for tone and completeness. Use it to calibrate the automatic scores, not as the only check.

## A minimal harness

The harness runs every case, records the result, and prints a summary:

```python
results = []
for case in cases:
    answer = answer_with_rag(case["question"], index)[0]
    passed = case["expected"].lower() in answer.lower()
    results.append({"id": case["id"], "passed": passed})

pass_rate = sum(r["passed"] for r in results) / len(results)
print(f"pass rate: {pass_rate:.0%} over {len(results)} cases")
```

Save each run's results with the model name, the prompt version, and the date. Without that record, you cannot tell which change caused a drop.

## Retrieval metrics

For RAG, measure retrieval on its own before judging answers:

- **Hit rate at k.** Share of questions where the correct passage appears in the top k results.
- **Mean reciprocal rank.** How high the correct passage ranks, on average.

If hit rate is low, fix chunking or search before touching the prompt. A better prompt cannot recover a passage that was never retrieved. See Chunking Strategies.

## Regression testing

Treat the evaluation like unit tests:

1. Run it before any change to prompts, chunking, models, or tool descriptions.
2. Compare the new pass rate with the last recorded run.
3. Investigate every case that changed from pass to fail, even when the overall rate rose.

Overall numbers can hide a case that got worse, and that case may be the one that matters most to a customer.

## Common mistakes

- Testing only on questions the team wrote, which are easier than real ones
- Changing several things at once, so no one knows which change helped
- Using the same model to write the answer and to judge it, without checking
- Reporting one number without the test set size, so a 100 percent pass rate on 4 cases looks like proof
- Skipping refusal cases, so a system that invents answers scores well

## Where to start

Build 30 cases from real questions this week. Run the RAG lab's sample questions through the same harness, then add your own. A small, honest test set is worth more than a large one nobody checks.

See also Agentic AI Setup for an agent evaluation table.
