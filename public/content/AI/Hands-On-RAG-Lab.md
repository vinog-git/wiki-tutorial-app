# AI: Hands-On RAG Lab

This lab builds retrieval-augmented generation (RAG) step by step, then gives an agent tools to show where RAG fits. You will run it on the Northwind Outfitters sample data in the `rag-lab` folder.

Complete Setup Open WebUI Locally (the AI section) first, or at least have Ollama running with `llama3.2` and `nomic-embed-text`.

## Goals

By the end you should be able to:

1. Explain each stage of RAG: chunk, embed, search, and answer.
2. Predict which passage will be retrieved for a question, then check the prediction.
3. Explain why a correct answer can fail because of retrieval, not generation.
4. Explain when an agent should search documents and when it should call a tool.
5. Use Open WebUI to run the same documents through a chat model.

## The sample data

| Folder | Files | Use |
|---|---|---|
| `sample-data/knowledge/` | returns policy, shipping, loyalty program, product care, customer support | Documents for RAG |
| `sample-data/data/` | `orders.csv`, `products.json` | Structured records for tools |

Notice the difference. Policy questions are answered from text, so they need RAG. "What is the status of order NW-1044?" is answered from a record, so a lookup tool is the right choice.

## Step 1: Run the offline tests

```bash
cd rag-lab
python3 -m unittest -v test_rag_lab
```

All 12 tests should pass. They use a fake embedding function, so this step checks the code, not the model. A failure here means the code is broken, and no model will fix it.

## Step 2: Read the chunks

Open `sample-data/knowledge/returns-policy.md` and find the section "Return window".

Then run:

```bash
python3 rag_lab.py inspect "How long do I have to return an item?"
```

Check the output:

- The first passage should come from the "Return window" section of `returns-policy.md`.
- Each passage shows its source file, its section heading, and a score.

**Predict first:** before you run the command, write down which file and section you expect to rank first. Then compare. A wrong prediction tells you which part of the document you misjudged.

## Step 3: Test retrieval on hard questions

Run these and note the top passage for each:

```bash
python3 rag_lab.py inspect "Can I get my money back?"
python3 rag_lab.py inspect "How much does the Harbor Tote cost?"
python3 rag_lab.py inspect "Do points expire?"
```

Questions 1 and 3 are phrased differently from the text, so they test meaning, not keywords. Question 2 is a price, and price lives in `products.json`, not in the documents. Retrieval over the documents cannot answer it. This is the point where an agent with a lookup tool is needed.

## Step 4: Plain RAG

```bash
python3 rag_lab.py ask "How long do refunds take after the warehouse receives a return?"
```

Read the answer and check its citations against the retrieved passages. Then try a question the documents do not answer:

```bash
python3 rag_lab.py ask "What is the CEO's phone number?"
```

A good answer says it does not know. If the model invents a number, the prompt is too weak. Changing `RAG_SYSTEM_PROMPT` in `rag_lab.py` is the place to fix it.

## Step 5: The agent

```bash
python3 rag_lab.py agent "Where is order NW-1044, and how many Harbor Totes are in stock?"
```

The output shows each tool call and its result. Expected behavior:

1. `lookup_order` with `NW-1044`, which returns a delivered order.
2. `get_product` with `NW-BAG-220`, which shows zero stock.
3. A final answer that uses both results.

Then try a policy question:

```bash
python3 rag_lab.py agent "Can I return swimwear?"
```

This should call `search_knowledge`, and the answer should mention the hygiene exception.

If the agent calls the wrong tool, look at the tool descriptions in `TOOL_SCHEMAS`. The model chooses tools from those descriptions, so a vague description leads to wrong choices.

## Step 6: Break it on purpose

Each change below teaches one idea. Make one change at a time, then rerun Step 2 and Step 4.

1. **Retrieve fewer passages.** Run `python3 rag_lab.py ask "..." -k 1`. Does the answer lose a detail it needed?
2. **Change chunk size.** In `load_chunks`, pass `max_words=30` to `chunk_markdown`. Retrieval often gets more precise, but a single answer may need several chunks.
3. **Remove the heading from the embedded text.** In `Index.__init__`, embed only `c['text']`. Ask "What is the return window?" and compare scores.
4. **Ask a question with the answer split across two sections.** The "Refunds" and "Return window" sections of the returns policy are good candidates. Does retrieval return both?

## Step 7: Check your understanding

Answer these without looking, then check against the lab:

- Why does the chunker add the heading to the text before embedding?
- Why can the same question get a different answer when `-k` changes?
- Why does RAG alone fail on "What does the Harbor Tote cost?"
- Why must the query and the documents use the same embedding model?
- What stops the agent from looping forever, and where is that set?

If you can answer all five, you understand the core mechanics of RAG and tool use.

## Step 8: Repeat in Open WebUI

The same documents can be loaded into Open WebUI to check the results with a full chat interface.

1. Open `http://localhost:3000` and go to **Workspace → Knowledge**.
2. Select **+** to create a collection named `Northwind Support`.
3. Upload the five files from `sample-data/knowledge/`.
4. Wait until each file shows as processed.
5. Start a new chat. Type `#` in the message box and choose `Northwind Support`, or use the attach menu to add the collection.
6. Ask the same questions from Step 4. Compare the citations with `inspect`.

Open WebUI does not call `lookup_order` or `get_product`. It answers from documents only. Ask "What is the status of NW-1044?" and note that it cannot answer. This is the same gap you saw in Step 3, now in a real product.

## Step 9: Create a model with knowledge attached (optional)

1. Go to **Workspace → Models** and select **+**.
2. Set the base model to `llama3.2`.
3. Add a system prompt such as "Answer only from the knowledge base. If it does not say, say you do not know."
4. Attach the `Northwind Support` collection.
5. Save and start a chat with this model. It should answer from the documents without you attaching them each time.

## Common problems

| Problem | Likely cause | Fix |
|---|---|---|
| `inspect` shows `connection refused` | Ollama not running | Run `ollama serve` or check the service |
| `model "nomic-embed-text" not found` | Model not pulled | `ollama pull nomic-embed-text` |
| Agent answers without calling tools | Model too small for tool calling | Use `llama3.2` or a larger model with tool support |
| Results change between runs | Model temperature or a changed model | Compare with the same model and settings |
| Open WebUI cites the wrong file | Documents uploaded with a different embedding model | Re-upload after changing the embedding model |

## What to take away

RAG improves answers only when the right passage is retrieved. Most bad answers trace back to retrieval, so test retrieval first, then generation. Agents extend RAG with tools for structured data and actions, and the tool descriptions decide how well that works.
