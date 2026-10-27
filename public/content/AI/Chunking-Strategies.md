# AI: Chunking Strategies

## Why chunk

Embedding models and language models have input limits. A 200-page manual cannot be embedded as one vector, and sending the whole manual in every prompt is expensive. Chunking splits documents into smaller passages that can be indexed and retrieved individually.

Chunking is usually the most important tuning step in RAG. Bad chunks produce bad retrieval, however good the model is.

## Size

- **Too large** (for example, several pages). The vector averages many topics, so search matches poorly, and the prompt fills with irrelevant text.
- **Too small** (for example, one sentence). Chunks lose the context they need to make sense.

A common starting point is 200 to 800 tokens per chunk, with an overlap of 10 to 20 percent. Tune these values with your own test questions.

## Common strategies

- **Fixed size.** Split every N tokens or characters. Simple and predictable, but it can cut sentences and ideas in half.
- **Recursive.** Split on paragraphs first, then sentences, then words, until chunks fit the size limit. A good default for most text.
- **Structure-based.** Split on headings in Markdown or HTML, and keep each section together. Works well for documentation.
- **Semantic.** Start a new chunk when the topic changes, using embedding similarity between sentences. More expensive to compute.
- **Parent-child.** Index small chunks for precise matching, but return the larger parent section to the model for context.

## Overlap

Overlap repeats some text between neighboring chunks, so a sentence that crosses a boundary still appears whole in at least one chunk. Too much overlap wastes storage and can return duplicate passages.

## Keep metadata with each chunk

Store the document title, section heading, page number, and source URL with every chunk. Prepend the heading path to the chunk text before embedding. This helps retrieval when a passage alone is vague, such as "The default is 30 seconds."

## Tables and code

Do not split tables or code blocks in the middle. Treat each table or code block as a unit, or convert tables to text rows that include their column names.

## How to tune

1. Write 20 to 50 realistic questions with known answers and source passages.
2. Index with one strategy and size.
3. Measure how often the correct chunk appears in the top results.
4. Change one setting and repeat.
