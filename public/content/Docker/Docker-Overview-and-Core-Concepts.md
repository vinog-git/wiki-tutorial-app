# Docker: Overview and Core Concepts

Docker packages an application and everything it needs (runtime, libraries, config) into an **image**, and runs that image as an isolated **container**. The same image runs on a laptop, in CI and in production, which removes the "works on my machine" problem.

## Images and containers

| Term | Meaning | Analogy |
|---|---|---|
| **Image** | Read-only template made of stacked layers | A class |
| **Container** | A running (or stopped) instance of an image, with a writable layer on top | An object |
| **Layer** | One filesystem change from one Dockerfile instruction; cached and shared | A git commit |
| **Registry** | Server that stores and serves images (Docker Hub, Amazon ECR, GitHub Container Registry) | A package repository |
| **Tag** | A name for an image version, e.g. `postgres:16` | A release label |
| **Digest** | Immutable content hash, `sha256:...` | A commit SHA |

## Architecture

```
docker CLI  ──REST API──▶  dockerd (daemon)  ──▶  containerd  ──▶  runc  (creates the container)
                              │
                              └── pulls / pushes images ──▶ Registry
```

- The **CLI** sends commands to the **daemon** (`dockerd`) over a socket.
- The daemon manages images, networks, volumes and containers.
- **containerd** and **runc** do the low-level work using Linux namespaces (isolation) and cgroups (resource limits).

Containers share the host kernel. They are isolated processes, not virtual machines, so they start in milliseconds and use little overhead. The trade-off: a Linux container needs a Linux kernel (Docker Desktop runs a small Linux VM on macOS and Windows).

## Install and verify

```bash
docker version
docker run --rm hello-world
```

```output
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

## Your first container

```bash
docker run -d --name web -p 8080:80 nginx:1.27   # detached, name it, map host 8080 to container 80
docker ps                                        # running containers
curl -s localhost:8080 | head -4
docker logs web                                  # what the container wrote to stdout/stderr
docker stop web                                  # SIGTERM, then SIGKILL after 10 s
docker rm web                                    # delete the stopped container
```

```output
CONTAINER ID   IMAGE        COMMAND                  CREATED         STATUS         PORTS                  NAMES
3f9c1a2b7d10   nginx:1.27   "/docker-entrypoint.…"   5 seconds ago   Up 4 seconds   0.0.0.0:8080->80/tcp   web
```

## Everyday commands

| Task | Command |
|---|---|
| Run a container | `docker run [options] image [command]` |
| List running / all containers | `docker ps` / `docker ps -a` |
| Open a shell inside a running container | `docker exec -it web sh` |
| View logs (follow) | `docker logs -f --tail 100 web` |
| Resource usage | `docker stats` |
| Details (IP, mounts, state, exit code) | `docker inspect web` |
| Copy a file out | `docker cp web:/etc/nginx/nginx.conf ./nginx.conf` |
| List images | `docker images` |
| Pull / push | `docker pull postgres:16` / `docker push repo/app:1.0` |
| Remove unused data | `docker system prune` (see the warning on volumes below) |

## Run options you will use constantly

| Option | Purpose |
|---|---|
| `-d` | Run in background |
| `-it` | Interactive terminal |
| `--name` | Stable name instead of a random one |
| `-p host:container` | Publish a port |
| `-e KEY=value` / `--env-file .env` | Environment variables |
| `-v name:/path` or `-v $(pwd):/path` | Volume or bind mount (see Volumes page) |
| `--network app-net` | Attach to a network (see Networking page) |
| `--restart unless-stopped` | Restart after crash or reboot |
| `--memory 512m --cpus 1.0` | Resource limits |
| `--rm` | Delete the container when it exits (see the logging page before using it) |
| `--read-only` | Make the root filesystem read-only |

## Container lifecycle

```
created ──start──▶ running ──stop/SIGTERM──▶ exited ──rm──▶ removed
                      │  ▲
                 pause│  │unpause
                      ▼  │
                    paused
```

A container exits when its main process exits. The exit code is stored and visible with `docker inspect`. **Exit code 0** means success, **137** means killed (often by OOM or `docker kill`), and **143** means terminated by SIGTERM.

## Key takeaways

- An image is a read-only template; a container is a running instance with a writable layer that is lost when the container is removed.
- Containers are isolated processes sharing the host kernel, not VMs.
- Data must go in volumes or external services; the writable layer does not survive `docker rm`.
- Use names, explicit ports and restart policies for anything long-running.
