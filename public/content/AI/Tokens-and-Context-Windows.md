# AI: Tokens and Context Windows

## Tokens

A language model does not read characters or words directly. It reads tokens, which are chunks of text produced by a tokenizer. A token can be a whole word, part of a word, or a punctuation mark. As a rough guide, one token is about four characters of English text, or about three-quarters of a word.

Tokens matter because they control three things:

- **Cost.** Hosted APIs bill by input and output tokens.
- **Speed.** More tokens take longer to process and generate.
- **Limits.** Every model has a maximum number of tokens it can handle at once.

## Context window

The context window is the total number of tokens a model can consider in a single request. It includes everything sent in that request:

- The system prompt
- The conversation history
- Any documents or retrieved passages
- Tool definitions and tool results
- The model's own output

When the total exceeds the window, the request fails or older content is dropped, depending on the tool.

## Input and output limits

Some models have a separate limit on output tokens. A model can accept a large input and still stop after a shorter answer. Check both numbers for the model you use.

## Why long context is not a free fix

A larger window does not mean the model uses all of it equally well. Important details placed in the middle of a very long prompt are often missed. Keep prompts focused. Put the most important instructions and data near the start or end.

Long context also costs more and responds more slowly. For large document sets, RAG is usually cheaper and more accurate than pasting everything into the prompt.

## Managing the window in practice

- Summarize old conversation turns instead of keeping every message.
- Retrieve only the relevant passages, not whole files.
- Trim tool outputs to the fields the model needs.
- Count tokens with the tokenizer for your model before sending large requests.

## Local models

Local models often have smaller context windows than hosted models, and the memory needed grows with the window size. Setting a larger context in Ollama and local models uses more RAM or VRAM.
