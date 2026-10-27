# Docker: Data Recovery and Backup

Containers are disposable; data is not. Recovery planning for Docker means knowing what lives where, backing up the data (not the containers), testing restores, and never relying on a single host.

## What to back up, and what to rebuild

| Item | Recreate from | Back up? |
|---|---|---|
| Images | Dockerfile and source (rebuild) or the registry | Keep in a registry with lifecycle rules; back up the registry storage |
| Container writable layer | Nothing | No. Never store data here. |
| Named volumes (databases, uploads) | Nothing | **Yes** |
| Bind-mounted host directories | Host backup tooling | **Yes** (host backups) |
| Compose files, Dockerfiles, configs | Git | Yes, in git |
| Secrets | Secret manager | Yes, in the secret manager, not in the Docker host |

Rule of thumb: **images are rebuilt, configuration is versioned, data is backed up.**

## Recovery scenarios

| Scenario | What happened | Recovery path |
|---|---|---|
| Container crashed | Process died | Restart policy or `docker start`; data untouched |
| Container deleted by mistake | `docker rm` or `docker compose down` | Recreate with the same volume; data untouched (only `-v` deletes volumes) |
| Volume deleted by mistake | `docker volume rm`, `prune`, or `down -v` | Restore from the last backup |
| Data corrupted by a bad migration | Application logic error | Point-in-time restore or logical dump from before the change |
| Host disk failed | Hardware | Rebuild the host, restore volumes from off-host backups, redeploy from the registry |
| Host or region lost | Disaster | Restore into a second host or region from off-site copies |

## Backing up a named volume

Mount the volume and a host directory into a throwaway container, then archive:

```bash
docker run --rm \
  -v pgdata:/data:ro \
  -v "$(pwd)/backups:/backup" \
  alpine tar czf /backup/pgdata-$(date +%F-%H%M).tar.gz -C /data .
ls -lh backups/
```

```output
-rw-r--r-- 1 root root 42M Oct 27 02:00 pgdata-2026-10-27-0200.tar.gz
```

The `:ro` on the source makes the backup unable to change the data.

## Restoring a named volume

Restore into an **empty** volume. The restore overwrites files, so stop anything writing to the volume first:

```bash
docker compose stop db
docker volume rm pgdata               # only if you are replacing it
docker volume create pgdata
docker run --rm \
  -v pgdata:/data \
  -v "$(pwd)/backups:/backup:ro" \
  alpine sh -c 'cd /data && tar xzf /backup/pgdata-2026-10-27-0200.tar.gz'
docker compose start db
```

> File-level backups of a running database can be inconsistent. Stop the database first, or use the database's own backup tool (below).

## Backing up a database properly: logical dumps

Logical dumps are portable, consistent, and can be restored into a different version. Run the tool inside the database container:

```bash
# Backup
docker exec -t db pg_dump -U app -Fc orders > backups/orders-$(date +%F).dump

# Restore into a new empty database
docker exec -i db createdb -U app orders_restore
docker exec -i db pg_restore -U app -d orders_restore < backups/orders-2026-10-27.dump
docker exec -it db psql -U app -d orders_restore -c "SELECT count(*) FROM orders;"
```

```output
 count
-------
  1284
(1 row)
```

For MySQL use `mysqldump`, for MongoDB `mongodump`. Schedule the dump with cron on the host, or as a sidecar container running on a schedule.

## Scheduled backups with Compose

```yaml
services:
  db-backup:
    image: postgres:16
    depends_on:
      db:
        condition: service_healthy
    environment:
      PGPASSWORD: ${DB_PASSWORD}
    volumes:
      - ./backups:/backups
    entrypoint: >
      sh -c 'while true; do
        pg_dump -h db -U app -Fc orders > /backups/orders-$$(date +%F-%H%M).dump;
        find /backups -name "*.dump" -mtime +14 -delete;
        sleep 86400;
      done'
    networks: [backend]
```

The `find ... -mtime +14 -delete` keeps 14 days of dumps. Copy the backup directory off the host as well (S3 with versioning, another server, or a backup service).

## Off-host copies

A backup on the same disk is not a backup. Copy to a different failure domain:

```bash
aws s3 cp backups/ s3://orders-backups-prod/db/ --recursive \
  --storage-class STANDARD_IA --sse aws:kms
```

Enable S3 versioning and Object Lock on the backup bucket so a compromised account cannot delete the history (see the S3 page in the AWS section).

## Backing up images and the registry

You can rebuild images, but emergency recovery is faster with saved copies:

```bash
docker save orders-service:1.0 | gzip > images/orders-service-1.0.tar.gz
docker load < images/orders-service-1.0.tar.gz      # on a new host
```

For regular operation, the registry is the source of truth. Use registry replication (ECR cross-region replication) rather than `docker save` for routine resilience.

## Backing up Compose and configuration

Everything except data should be in git. Keep the repository, the `.env` template (without secrets), and the image tags used in each release.

```bash
git -C ~/stacks/orders log --oneline -5
docker compose -f ~/stacks/orders/docker-compose.yml config     # rendered config, for the record
```

## Restore drill

A backup you have not restored is unverified. Do this on a schedule, on a spare host or a throwaway environment:

1. Provision an empty host with Docker installed.
2. Pull the Compose repository and images from the registry.
3. Restore the newest dump or archive into fresh volumes.
4. Start the stack and run smoke tests (health endpoint, row counts, a known record).
5. Record how long each step took. That is your real recovery time.

## Recovery checklist

- [ ] Data is in volumes or external services, not in container layers
- [ ] Backups run on a schedule and are copied off-host
- [ ] Backup retention is defined and enforced
- [ ] Backups are encrypted and access-controlled
- [ ] Restore procedure is written down and has been tested this quarter
- [ ] Compose files and images are in git and the registry
- [ ] Secrets can be re-issued without reading the old ones

## Key takeaways

- Rebuild images, version configuration, back up data.
- Use logical dumps for databases; file copies of a running database can be inconsistent.
- Store backups off the host, encrypted, with retention and versioning.
- A backup is only proven by a restore drill; record how long it takes.
- `down -v`, `volume prune` and `system prune --volumes` are the commands that cause data loss.
