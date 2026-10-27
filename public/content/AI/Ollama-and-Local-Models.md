# AI: Ollama and Local Models

## What it is

Ollama is a tool for downloading and running open-weight language models on your own machine. It handles model files, quantization, and a local HTTP API, so you can run models without a cloud account.

## Why run models locally

- **Privacy.** Prompts and documents never leave the machine.
- **Cost.** No per-token charges after the hardware is paid for.
- **Offline use.** Works without internet access once a model is downloaded.
- **Control.** You choose the model, version, and settings.

The trade-off is quality and speed. Small local models are weaker than the largest hosted models, and they need enough RAM or VRAM.

## Basic commands

```bash
ollama pull llama3.2      # download a model
ollama run llama3.2       # chat in the terminal
ollama list              # show installed models
ollama ps                # show loaded models and memory use
```

Model names can include a size tag, such as `:8b`, and a quantization tag. Quantization stores weights at lower precision, which reduces memory use with a small loss in quality.

## The HTTP API

Ollama serves an API on port `11434` by default. It has its own endpoints and an OpenAI-compatible endpoint under `/v1`, so tools built for OpenAI can point at it with only a base URL change.

## Choosing a model size

- Match the model to your memory. A model that does not fit in memory runs very slowly or fails.
- Start with a small model for development, then test the same prompts on a larger one.
- Test on your real task. Benchmarks do not always predict results for your data.

## Connecting to Open WebUI

Open WebUI can use Ollama as a backend. Set `OLLAMA_BASE_URL` to the Ollama address. When both run in Docker, the address often needs to be the host's address instead of `localhost`. See Open WebUI.

## Common problems

- **Out of memory.** Use a smaller model or a more heavily quantized one.
- **Slow first response.** The model is loading into memory. Later requests are faster.
- **Connection refused from a container.** The container cannot reach `localhost` on the host. Use the host's network address.
