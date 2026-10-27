# AI: Embeddings and Vector Databases

## Embeddings

An embedding is a list of numbers (a vector) that represents the meaning of a piece of text. An embedding model is trained so that texts with similar meaning get vectors that point in similar directions.

For example, "reset my password" and "I forgot my login credentials" have different words but nearby vectors. Keyword search would miss this match. Embedding search finds it.

A typical embedding has hundreds to a few thousand dimensions. The exact number depends on the model.

## Similarity

Vectors are compared with a similarity measure. The most common are:

- **Cosine similarity.** Compares direction and ignores length. The usual choice for text.
- **Dot product.** Faster, and equivalent to cosine when vectors are normalized.
- **Euclidean distance.** Measures straight-line distance.

Use the measure the embedding model was trained for. Check its documentation.

## Vector databases

A vector database stores embeddings and finds the nearest ones to a query vector quickly. A brute-force search compares the query to every stored vector, which is fine for thousands of items but slow for millions. Vector databases use approximate nearest neighbor (ANN) indexes such as HNSW to trade a small amount of accuracy for large speed gains.

Common options include pgvector (PostgreSQL extension), Qdrant, Milvus, Weaviate, Chroma, and the vector stores built into many frameworks.

## Storing metadata

Store each vector with its source text, document name, page, date, and any access-control fields. Filter on metadata before or during the search so users only see content they are allowed to read.

## Choosing an embedding model

- Pick a model trained for retrieval, not only for classification.
- Check the language coverage if your text is not English.
- Keep the same model for indexing and querying. Vectors from different models are not comparable.
- If you change the model, re-embed the whole collection.

## Limits to know

- Embeddings capture topic and meaning, not exact facts. Use keyword search alongside them for names, codes, and IDs.
- Long inputs are truncated by most embedding models. Chunk text first. See [chunking strategies](/AI/Chunking-Strategies).

## Where this is used

Embeddings are the retrieval step in RAG. They are also used for semantic search, duplicate detection, and recommendations.
