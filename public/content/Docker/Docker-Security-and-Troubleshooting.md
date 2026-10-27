# Docker: Security, Resource Limits and Troubleshooting

Containers share the host kernel, so a container is a security boundary only if you configure it as one. This page covers hardening, limiting resources, and the diagnostic commands you use when a container misbehaves.

## Security baseline

| Control | Why | How |
|---|---|---|
| Run as non-root | Root in a container is root on the host if the container escapes | `USER app` in the Dockerfile, or `--user 1000:1000` |
| Read-only root filesystem | Stops an attacker writing tools or changing binaries | `--read-only` plus `--tmpfs /tmp` |
| Drop capabilities | Containers get a default set of Linux capabilities | `--cap-drop ALL`, then add back only what is needed |
| No new privileges | Stops setuid escalation | `--security-opt no-new-privileges` |
| Seccomp profile | Restricts system calls | Default profile is on; do not use `--privileged` |
| Minimal images | Fewer packages, fewer vulnerabilities | Distroless or slim base images |
| Scan images | Known CVEs | Trivy, ECR scan, Docker Scout |
| Never mount the Docker socket into app containers | Access to the socket is root on the host | Use a dedicated tool container if you need it |

```bash
docker run -d --name orders \
  --user 10001:10001 \
  --read-only --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 200 \
  orders-service:1.0
```

### Check a running container

```bash
docker inspect -f 'user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} privileged={{.HostConfig.Privileged}}' orders
docker top orders
```

```output
user=10001:10001 readonly=true privileged=false
```

### Scan an image

```bash
trivy image --severity HIGH,CRITICAL orders-service:1.0
```

```output
orders-service:1.0 (debian 12.7)
Total: 3 (HIGH: 2, CRITICAL: 1)
┌──────────────┬────────────────┬──────────┬───────────────────┬───────────────┐
│   Library    │ Vulnerability  │ Severity │ Installed Version │ Fixed Version │
├──────────────┼────────────────┼──────────┼───────────────────┼───────────────┤
│ libssl3      │ CVE-2025-XXXX  │ CRITICAL │ 3.0.11-1          │ 3.0.13-1      │
└──────────────┴────────────────┴──────────┴───────────────────┴───────────────┘
```

Fix by rebuilding on a newer base image and pinning the digest in production.

### Secrets

- Do not put secrets in `ENV`, `ARG`, image layers or the build context.
- Inject at runtime from a secret manager, or mount a file in `/run/secrets`.
- Rotate on any suspicion of exposure. `docker history` and `docker inspect` show environment values to anyone with access to the daemon.

## Docker daemon security

Whoever can talk to the Docker socket can become root on the host (they can start a container that mounts `/`).

- Add users to the `docker` group only if you trust them completely. Prefer rootless Docker for developer machines.
- Do not expose the daemon on a TCP port without TLS client authentication.
- Keep Docker Engine updated.

```bash
docker info --format '{{.SecurityOptions}}'      # shows seccomp, apparmor, rootless if enabled
```

## Resource limits

Without limits a single container can starve the host. Set them on every long-running container.

| Flag | Limits | Example |
|---|---|---|
| `--memory` / `-m` | RAM; exceeding it kills the process (OOM) | `--memory 1g` |
| `--memory-swap` | RAM + swap; `-1` disables swap | `--memory 1g --memory-swap 1g` |
| `--cpus` | CPU quota | `--cpus 1.5` |
| `--cpu-shares` | Relative CPU weight when contended | `--cpu-shares 512` |
| `--pids-limit` | Maximum processes (stops fork bombs) | `--pids-limit 200` |
| `--ulimit nofile=65536:65536` | Open file descriptors | Needed by many servers |

```bash
docker run -d --name orders --memory 1g --cpus 1.5 --pids-limit 200 orders-service:1.0
docker stats --no-stream orders
```

```output
CONTAINER ID   NAME     CPU %     MEM USAGE / LIMIT   MEM %     NET I/O       BLOCK I/O   PIDS
9a8b7c6d5e4f   orders   3.12%     412.6MiB / 1GiB     40.29%    1.2kB / 0B    0B / 0B     38
```

### JVM containers

Old JVMs ignored container limits and sized the heap from the host's RAM. Modern JDKs read the cgroup limit. Let the JVM use a percentage of the container limit:

```bash
docker run -d --memory 1g -e JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75" orders-service:1.0
```

Leave headroom for non-heap memory (metaspace, threads, direct buffers). Setting the heap to 100% of the limit causes OOM kills.

## Troubleshooting toolkit

| Question | Command |
|---|---|
| Is it running, and how did it end? | `docker ps -a` and `docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' <c>` |
| What did it print? | `docker logs --timestamps --tail 200 <c>` |
| What is it doing right now? | `docker top <c>` and `docker exec <c> ps aux` |
| How much CPU/RAM/IO? | `docker stats <c>` |
| What changed on the filesystem? | `docker diff <c>` (A added, C changed, D deleted) |
| Full configuration | `docker inspect <c>` |
| Which events happened? | `docker events --since 30m` |
| Disk usage | `docker system df` |
| Why is a healthcheck failing? | `docker inspect -f '{{json .State.Health}}' <c> \| python3 -m json.tool` |
| Debug a container without a shell | `docker debug <c>` or `nsenter` from the host |

### Debug a container with no shell

Distroless images have no `sh`. Attach a debug container to the same namespaces:

```bash
docker run -it --rm --pid container:orders --network container:orders \
  nicolaka/netshoot bash
ps aux
ss -tlnp
```

### Read the health check history

```bash
docker inspect -f '{{range .State.Health.Log}}{{.End}} exit={{.ExitCode}} {{.Output}}{{end}}' orders
```

```output
2026-10-27T09:20:05Z exit=0 {"status":"UP"}
2026-10-27T09:20:15Z exit=1 curl: (7) Failed to connect to localhost port 8080
```

## Common problems and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Exit code 137, `OOMKilled=true` | Memory limit exceeded | Raise `--memory`, lower JVM heap percentage, find the leak |
| Exit code 1 right after start | Missing env var, bad config, failed migration | `docker logs`; check required variables |
| Exit code 127 | Command not found in image | Check `ENTRYPOINT`/`CMD` and the image's PATH |
| Exit code 126 | Permission denied on the entrypoint file | `chmod +x` in the build, or check the user |
| `permission denied` writing a file | Bind mount or volume ownership | Match UID; see the Volumes page |
| Container starts then restarts in a loop | Restart policy plus a crash on startup | `docker logs` from the failing run (the container keeps its log until removed); `docker events` shows each restart |
| `no space left on device` | Images, volumes, or logs filled the disk | `docker system df`, `docker system prune` (not `--volumes`), fix log rotation |
| Slow build | Cache invalidated early | Reorder Dockerfile; check `.dockerignore` |
| Port already allocated | Another process or container uses the host port | `ss -tlnp`, `docker ps`, change the host port |
| Container cannot resolve DNS | Custom daemon DNS or VPN interfering | Check `/etc/resolv.conf` in the container and daemon DNS settings |

## Cleaning up safely

```bash
docker container prune          # stopped containers only
docker image prune              # dangling images only
docker builder prune            # build cache older than a time you choose
docker system df                # check before pruning
```

Avoid `docker system prune -a --volumes` on hosts with databases. The volume flag deletes data in volumes not used by any running container.

## Key takeaways

- Run as non-root, read-only where possible, with dropped capabilities and no privileged mode.
- Set memory, CPU and PID limits; size the JVM heap as a percentage of the container limit.
- Exit code and `OOMKilled` answer most "why did it stop" questions.
- Scan images and rebuild on patched base images.
- Protect the Docker socket; it is root on the host.
