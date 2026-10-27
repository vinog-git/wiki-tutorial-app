# AI: Prompt Engineering

## What it is

Prompt engineering is the practice of writing the input to a language model so that its output is more accurate, consistent, and useful. The model's behavior depends heavily on how the request is framed.

## The parts of a prompt

- **System prompt.** Standing instructions: role, rules, tone, output format. Set once per conversation or per application.
- **User message.** The specific request or question.
- **Context.** Documents, data, or retrieved passages the model should use.
- **Examples.** A few input and output pairs that show the expected pattern.
- **Output format.** The exact shape you want, such as JSON with named fields.

## Techniques

- **Be specific.** "Summarize in three bullet points for a non-technical reader" works better than "summarize this."
- **Give the reason for a rule.** A model follows rules more reliably when it knows why they exist.
- **Use examples (few-shot).** Two or three good examples often beat a long description.
- **Ask for step-by-step reasoning** on multi-step problems, and separate the reasoning from the final answer when you need to parse the result.
- **Define the output format.** Request JSON, a table, or a fixed template, and validate the result in code.
- **Mark sections clearly.** Use headings, XML-style tags, or delimiters to separate instructions from data. This also reduces the risk of injected instructions in data being followed.
- **Say what to do when information is missing.** For example, "If the answer is not in the provided text, say so."

## Common mistakes

- Vague goals with no success criteria
- Conflicting instructions in the system prompt and user message
- Long prompts with no structure
- Trusting output without validation

## Testing prompts

Treat prompts like code. Keep a set of test inputs with expected results. Change one thing at a time and compare results across the set. A change that improves one case often breaks another.

## Where it matters most

Prompt quality matters most for:

- Extraction and classification tasks, where the output must be consistent
- RAG answers, where the model must stay within the supplied text
- agentic AI systems, where tool descriptions and instructions decide what the agent does

Prompt engineering cannot make a model know facts it was never given. For missing knowledge, add retrieval or tools.
