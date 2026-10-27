# AI: RAG (Retrieval-Augmented Generation)

## The problem

A language model only knows what was in its training data, and that data has a cutoff date. It knows nothing about your private documents, and it can state wrong facts with confidence.

## The idea

RAG fixes this without retraining the model. Before the model answers, the system retrieves the most relevant passages from your own documents and places them in the prompt. The model then answers from that text.

## The pipeline

1. **Ingest.** Load documents (PDF, Word, Markdown, web pages).
2. **Chunk.** Split each document into passages. See [chunking strategies](/AI/Chunking-Strategies).
3. **Embed.** Convert each chunk into a vector with an embedding model. See [embeddings and vector databases](/AI/Embeddings-and-Vector-Databases).
4. **Store.** Save the vectors and the original text in a vector index.
5. **Retrieve.** At question time, embed the question and fetch the closest chunks.
6. **Generate.** Send the question plus the retrieved chunks to the LLM, with instructions to answer from them and cite sources.

## Why it helps

- Answers can be grounded in current, private data.
- You can show sources, so people can check the answer.
- Updating knowledge means re-indexing documents, not retraining.

## Common failure modes

- **Wrong chunks retrieved.** The answer is wrong even though the right document exists. Check retrieval separately from generation.
- **Chunks too large or too small.** Large chunks dilute relevance. Small chunks lose context.
- **Context overflow.** Too many chunks exceed the tokens and context windows limit.
- **Ignoring the context.** The model answers from memory. Tell it explicitly to use only the supplied passages and to say when the answer is not there.

## Improving retrieval

- Combine keyword search (BM25) with vector search (hybrid search).
- Re-rank the top results with a cross-encoder before sending them to the model.
- Add metadata filters such as document type, date, or owner.

## RAG in Open WebUI

Open WebUI includes a built-in RAG flow. You upload files to a Knowledge collection, attach it to a chat or model, and the system retrieves from it. See Open WebUI.

## Evaluating RAG

Build a small set of questions with known answers and check two things: did retrieval return the right passage, and did the answer match it. Measure these separately so you know which part to fix.
