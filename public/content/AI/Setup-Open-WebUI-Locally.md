# AI: Setup Open WebUI Locally

This guide runs Open WebUI in Docker on your machine and connects it to Ollama, which runs the models on the host. It takes about 30 minutes, most of it model downloads.

The steps are for Linux with Docker installed. The Docker commands are the same on macOS and Windows, but the networking step differs. UI labels can change between Open WebUI releases, so if a menu name is different, look for the nearest match.

## What you will have at the end

- Ollama serving a chat model and an embedding model on the host
- Open WebUI running in a container at `http://localhost:3000`
- A chat that works with a local model
- Document upload and retrieval (RAG) configured, ready for the Hands-On RAG Lab

## Step 1: Check Docker

```bash
docker --version
docker run --rm hello-world
```

If `docker run` needs `sudo`, add your user to the `docker` group, then log out and back in:

```bash
sudo usermod -aG docker $USER
```

## Step 2: Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama --version
```

The installer sets up Ollama as a system service on `http://localhost:11434`.

## Step 3: Let the container reach Ollama

By default Ollama listens only on `127.0.0.1`. A container cannot reach that address on the host, so change the bind address.

```bash
sudo systemctl edit ollama.service
```

Add these lines in the editor, save, and exit:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

Then restart the service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
curl http://localhost:11434/api/tags
```

The last command should return JSON, even if the model list is empty.

> Security note: `0.0.0.0` makes Ollama reachable from your whole network. On a shared network, bind to the Docker bridge address (usually `172.17.0.1`) or block port 11434 in your firewall.

## Step 4: Download the models

```bash
ollama pull llama3.2           # chat model with tool calling (about 2 GB)
ollama pull nomic-embed-text   # embedding model for RAG (about 270 MB)
ollama list
```

`llama3.2` runs on most laptops with 8 GB of RAM. Use a larger model if you have more memory and want better answers.

## Step 5: Start Open WebUI

```bash
docker run -d -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart unless-stopped \
  ghcr.io/open-webui/open-webui:main
```

What each option does:

- `-p 3000:8080` opens the web UI on port 3000 of your machine.
- `--add-host` makes `host.docker.internal` resolve to the host, so the container can reach Ollama.
- `OLLAMA_BASE_URL` tells Open WebUI where Ollama is.
- `-v open-webui:/app/backend/data` keeps users, chats, and uploaded documents across restarts.

The first start can take a few minutes while the image downloads. Check progress with:

```bash
docker logs -f open-webui
```

## Step 6: Create the admin account

1. Open `http://localhost:3000`.
2. Select **Sign up**. The first account becomes the administrator.
3. Use a real email address and a strong password. The data stays on your machine, but the login protects it on a shared network.

## Step 7: Check the model connection

1. Open the model selector at the top of a new chat.
2. `llama3.2` should appear in the list.
3. Send "Hello". If the model replies, the connection works.

If no model appears, check the Ollama connection under **Admin Panel → Settings → Connections**. The Ollama URL should be `http://host.docker.internal:11434`.

## Step 8: Use Ollama for document embeddings

By default Open WebUI embeds documents with a model that runs inside the container. Switching to `nomic-embed-text` on Ollama keeps everything on one stack, and it is the setup the RAG lab assumes.

1. Open **Admin Panel → Settings → Documents**.
2. Set the embedding model engine to **Ollama**.
3. Set the embedding model to `nomic-embed-text`.
4. Save.

Change the embedding model before you upload documents. Documents indexed with one embedding model cannot be searched with another, so you would need to upload them again after a change.

## Step 9: Verify the install

```bash
docker ps --filter name=open-webui     # status should be "Up"
curl -s http://localhost:3000/health   # should return a success response
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No models in the dropdown | Container cannot reach Ollama | Repeat Step 3, then check `OLLAMA_BASE_URL` |
| `connection refused` in the logs | Ollama bound to 127.0.0.1 | Repeat Step 3 |
| Very slow replies | Model too large for memory | Use a smaller model, for example `llama3.2:1b` |
| Port 3000 in use | Another app uses it | Change `-p 3000:8080` to another host port, such as `-p 3100:8080` |
| Upload stuck on "processing" | Embedding model not pulled | Run `ollama pull nomic-embed-text` |

## Stopping and resetting

```bash
docker stop open-webui       # stop, keep data
docker start open-webui      # start again
docker rm -f open-webui      # remove the container, keep the open-webui volume
docker volume rm open-webui  # delete all users, chats, and documents
```

## Next step

Continue to the Hands-On RAG Lab to load the Northwind sample documents into Open WebUI and to build the same retrieval flow by hand.
