# AI: Open WebUI

## What it is

Open WebUI is a self-hosted, open-source web interface for large language models. It gives you a ChatGPT-style chat experience that runs on your own machine or server and talks to many model backends from one place.

## Why teams use it

- **Data stays on your infrastructure.** Conversations and uploaded documents are stored locally.
- **One UI, many backends.** It connects to Ollama for local models and to any OpenAI-compatible API (OpenAI, vLLM, LM Studio, LiteLLM proxies, and so on).
- **Multi-user.** Accounts, roles (admin and user), and admin control over which models each user can see.

## Core features

- **Chat** with conversation history, folders, tags, markdown and code rendering, and model switching mid-conversation.
- **Knowledge** collections for RAG, where you upload documents and chat against them. See RAG.
- **Tools and Functions** written in Python, so a model can call your own code.
- **Pipelines** for custom request routing, filtering, or logic in front of a model.
- **Custom models** that bundle a base model with a system prompt and settings.

## Running it with Docker

```bash
docker run -d -p 3000:8080 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

Open `http://localhost:3000` and create the first account. That first account becomes the admin.

The `-v` volume keeps your data (users, chats, uploads) across container restarts. Without it, the data is lost when the container is removed.

## Connecting a backend

Backends are set either with environment variables at startup or in the admin settings screen afterwards. Typical variables are `OLLAMA_BASE_URL` for Ollama and `OPENAI_API_BASE_URL` with `OPENAI_API_KEY` for OpenAI-compatible servers.

## Things to watch

- Check the license before you rebrand or redistribute it. Recent versions use a license with branding conditions.
- Pin a version tag in production instead of relying on `main`.
- Model quality depends on the backend. The UI does not make a small local model smarter.

## Related topics

- Ollama and local models for running the models Open WebUI talks to.
- RAG for how the Knowledge feature works.
- agentic AI for models that act on their own.
