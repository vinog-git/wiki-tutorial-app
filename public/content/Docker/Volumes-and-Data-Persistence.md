# Docker: Volumes and Data Persistence

A container's writable layer disappears when the container is removed. Anything that must survive, such as database files, uploads, or generated reports, belongs in a **volume** or a **bind mount**.

## Three storage types

| Type | Managed by | Location | Typical use |
|---|---|---|---|
| **Named volume** | Docker | `/var/lib/docker/volumes/<name>/_data` on Linux | Databases, app data |
| **Bind mount** | You | Any host path | Development: source code, config files |
| **tmpfs mount** | Docker | Host memory only | Secrets or scratch data that must never hit disk |

```bash
docker volume create pgdata
docker run -d --name db -e POSTGRES_PASSWORD=dev -v pgdata:/var/lib/postgresql/data postgres:16
docker run -d --name app -v "$(pwd)/config:/app/config:ro" orders-service:1.0   # bind mount, read-only
docker run --rm --tmpfs /run/secrets:rw,size=1m alpine sh -c 'echo "in memory" > /run/secrets/token'
```

## Verify a volume survives

```bash
docker run -d --name db -v pgdata:/var/lib/postgresql/data postgres:16
docker exec db sh -c 'echo "row 1" > /var/lib/postgresql/data/marker.txt'
docker rm -f db                                         # container gone
docker run --rm -v pgdata:/data alpine cat /data/marker.txt
```

```output
row 1
```

The volume outlived the container.

## Volume commands

```bash
docker volume ls                 # list volumes
docker volume inspect pgdata     # mountpoint, driver, labels, which containers use it
docker volume rm pgdata          # delete; fails if a container still uses it
docker volume prune              # delete all volumes not used by any container
```

> **Warning:** `docker system prune --volumes` and `docker volume prune` permanently delete data in volumes that no container currently uses. A stopped database container's volume counts as unused. Back up before pruning.

## Volumes with Compose

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:          # declared at top level so it is named, reusable, and not removed by `down`
```

`docker compose down` keeps named volumes. `docker compose down -v` deletes them, which is a common accident.

## Bind mounts: permissions and paths

- Host paths must be absolute (`$(pwd)/...` or `${PWD}` in Compose).
- The container user's UID must be able to write to the host directory. A mismatch produces `Permission denied`.

```bash
mkdir -p ./data && sudo chown 999:999 ./data     # match the UID the container runs as
docker run -d -v "$(pwd)/data:/var/lib/app" orders-service:1.0
```

## Where things go in a typical service

| Data | Put it in |
|---|---|
| Application config | Env vars or a mounted read-only config file |
| Secrets | Runtime injection (env from a secret manager, or a mounted file), never the image |
| Database files | Named volume, plus regular backups (next page) |
| Uploads | Object storage (S3) in production; a volume only for local dev |
| Logs | stdout/stderr, collected by a log driver (see the Logging page) |
| Temporary files | Container's `/tmp` or a tmpfs |

## Sharing data between containers

```bash
docker run -d --name producer -v shared:/data alpine sh -c 'while true; do date >> /data/log.txt; sleep 5; done'
docker run --rm -v shared:/data alpine tail -n 2 /data/log.txt
```

Two containers can mount the same volume. Coordinate writers yourself: Docker does not lock files. For a database, only one process should own the data directory.

## Permissions inside a named volume

A new named volume copies the image's contents at that path on first use, including ownership. If the image's directory is owned by root and the process runs as non-root, the volume is not writable. Fix it in the Dockerfile:

```dockerfile
RUN mkdir -p /var/lib/app/uploads && chown app:app /var/lib/app/uploads
VOLUME ["/var/lib/app/uploads"]
USER app
```

## Read-only root filesystem

Combine a read-only root with explicit writable volumes. This limits what an attacker can change inside the container.

```bash
docker run -d --read-only \
  --tmpfs /tmp \
  -v uploads:/var/lib/app/uploads \
  orders-service:1.0
```

## Key takeaways

- Container writable layers are temporary. Use named volumes for data, bind mounts for development.
- `docker compose down -v`, `volume prune` and `system prune --volumes` delete data. Know them before running them.
- Named volumes copy image ownership on first use; set UIDs and permissions in the Dockerfile.
- Backups are a separate concern: see [Data Recovery and Backup](/Docker/Data-Recovery-and-Backup).
