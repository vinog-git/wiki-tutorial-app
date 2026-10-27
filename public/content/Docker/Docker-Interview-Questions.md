# Docker Interview Questions

Short answers first, with the page that has the depth.

## Fundamentals

**1. What is the difference between an image and a container?**
An image is a read-only, layered template. A container is a running instance of an image with a writable layer on top. Many containers can run from one image. *(See Overview.)*

**2. Containers vs virtual machines?**
Containers share the host kernel and isolate processes with namespaces and cgroups, so they start in milliseconds with little overhead. VMs run a full guest OS on a hypervisor, which gives stronger isolation at higher cost. *(See Overview.)*

**3. What are layers and why do they matter?**
Each Dockerfile instruction creates a layer. Layers are cached and shared between images, so rebuilds and pulls only transfer what changed. *(See Dockerfile.)*

**4. What is the difference between CMD and ENTRYPOINT?**
ENTRYPOINT is the executable that always runs; CMD supplies default arguments that can be overridden at `docker run`. *(See Dockerfile.)*

**5. Why use exec form instead of shell form for ENTRYPOINT?**
Exec form runs the process as PID 1 directly, so it receives `SIGTERM` from `docker stop`. Shell form wraps it in `/bin/sh`, which may not forward signals. *(See Dockerfile.)*

**6. How do you make builds faster?**
Order instructions from least to most frequently changing, use `.dockerignore`, use BuildKit cache mounts, and use multi-stage builds to keep the final image small. *(See Dockerfile.)*

**7. What is a multi-stage build?**
A Dockerfile with several `FROM` stages. Build tools live in an early stage; only the artifacts are copied into the final stage, which keeps the runtime image small and free of compilers. *(See Dockerfile.)*

**8. How do you keep secrets out of an image?**
Do not use `ENV` or `ARG` for secrets, since they persist in history. Use BuildKit secret mounts at build time, and runtime injection or mounted secret files at run time. *(See Dockerfile and Security.)*

## Networking

**9. What network drivers exist and when do you use each?**
bridge (single host, default), user-defined bridge (DNS by name, use this), host (no isolation, performance), none (isolated), overlay (multi-host), macvlan (containers on the physical LAN). *(See Networking.)*

**10. Why do containers on the default bridge not resolve each other by name?**
The default bridge does not run Docker's embedded DNS. A user-defined network does. *(See Networking.)*

**11. What does `EXPOSE` do versus `-p`?**
`EXPOSE` documents a port. `-p host:container` publishes it so the host can reach it. Containers on the same user-defined network reach each other without publishing. *(See Networking.)*

**12. How do you connect a container to two networks?**
`docker network connect <net> <container>`, or list multiple networks under the service in Compose. *(See Connecting Between Networks.)*

**13. A frontend container must call a backend container on a separate network. How?**
Put a reverse proxy or gateway on both networks, so clients only reach the proxy, and the proxy forwards to the backend by service name. Avoid attaching the backend to the frontend network. *(See Connecting Between Networks.)*

**14. How do you connect containers on two different hosts?**
Overlay networks in Swarm, a Kubernetes CNI plugin, or routed networks over a VPN or VPC peering with non-overlapping subnets. *(See Connecting Between Networks.)*

**15. How does a container reach a database running on the host?**
Use `host.docker.internal` (built in on Docker Desktop; on Linux add `--add-host=host.docker.internal:host-gateway`), and make sure the database listens on an address reachable from the Docker bridge. *(See Connecting Between Networks.)*

**16. What does `internal: true` on a network do?**
It removes the route to the outside world for containers attached only to that network. Use it for databases and caches. *(See Networking.)*

**17. Why might a host firewall not block a published Docker port?**
Docker writes iptables rules that can bypass host firewall rules. Use the `DOCKER-USER` chain, bind to 127.0.0.1, or filter at the cloud network layer. *(See Networking.)*

## Storage and recovery

**18. Named volume vs bind mount vs tmpfs?**
Named volumes are managed by Docker and suited to data. Bind mounts map a host path, suited to development and config. tmpfs lives in memory and is never written to disk. *(See Volumes.)*

**19. Does data survive `docker rm`?**
Data in the writable layer does not. Data in named volumes and bind mounts does. `docker compose down -v` and `docker volume prune` delete named volumes. *(See Volumes.)*

**20. How do you back up a named volume?**
Run a temporary container that mounts the volume read-only and a backup directory, then `tar` the data. For databases, prefer logical dumps (`pg_dump`, `mysqldump`) run inside the database container. *(See Data Recovery.)*

**21. How do you recover a database that was deleted with its volume?**
Restore from the last off-host backup into a new volume, start the database, verify row counts and recent records, then reconnect applications. Recovery time depends on how often you have run restore drills. *(See Data Recovery.)*

**22. Why do file-level backups of a running database risk corruption?**
The database may be writing while the copy runs, producing a copy that is internally inconsistent. Use the database's own dump tool or stop it before copying files. *(See Data Recovery.)*

**23. Images or data: what do you back up?**
Data. Images are rebuilt from Dockerfiles and kept in a registry, and configuration lives in git. *(See Data Recovery.)*

## Logging

**24. Where does Docker store container logs by default?**
The `json-file` driver writes them to `/var/lib/docker/containers/<id>/<id>-json.log`. `docker logs` reads them. *(See Logging.)*

**25. What happens to logs when a container is removed?**
With the default driver the log file is deleted with the container. With `--rm`, the container is removed as soon as it exits, so its logs are lost unless a driver or shipper moved them first. *(See Logging.)*

**26. How do you keep logs after a crash?**
Use a log driver that forwards to a central system (awslogs, fluentd, loki, gelf), or run a shipper such as Fluent Bit that reads the container log files and sends them out. Do not use `--rm` for containers you want to investigate. *(See Logging.)*

**27. Why should a container write logs to stdout instead of files?**
stdout is captured by the logging driver, rotated, and shipped. Files inside the container live in the writable layer, are lost on removal, and grow until the disk fills. *(See Logging.)*

**28. How do you stop logs from filling the disk?**
Set rotation on the `json-file` or `local` driver (`max-size`, `max-file`), either per container or in `daemon.json`. *(See Logging.)*

**29. What does a good structured log line contain?**
A UTC timestamp, a level, service name and version, a trace or request ID, business identifiers, and the duration and outcome. It never contains secrets or personal data. *(See Logging.)*

**30. Why must you flush logs before shutdown?**
Buffered lines can be lost if the process is killed. Handle SIGTERM, drain asynchronous appenders, and set a shutdown timeout that gives them time. *(See Logging.)*

## Compose and operations

**31. What does `depends_on` guarantee?**
By default only the start order. Use `condition: service_healthy` (with a health check) to wait until a service is ready. *(See Compose.)*

**32. How do you run a one-time migration before the API starts?**
A `migrate` service with `restart: "no"`, and the API depends on it with `condition: service_completed_successfully`. *(See Compose.)*

**33. What is the difference between `docker compose down` and `down -v`?**
`down` removes containers and networks and keeps named volumes. `down -v` also deletes named volumes, which deletes data. *(See Compose.)*

**34. How do you limit a container's resources?**
`--memory`, `--cpus`, `--pids-limit`, and `--ulimit`. In Compose, `deploy.resources.limits` or the top-level equivalents. *(See Security.)*

**35. How should you size JVM heap in a container?**
Use `-XX:MaxRAMPercentage` (for example 75) so the heap follows the container limit, and leave room for non-heap memory. *(See Security.)*

**36. A container exited with code 137. What does it mean and what do you check?**
137 means it was killed with SIGKILL, often by the kernel OOM killer. Check `State.OOMKilled`, the memory limit, and heap settings. *(See Security.)*

**37. How do you debug a container that has no shell?**
Attach a debug container that shares its PID and network namespaces (`--pid container:<name> --network container:<name>`), or use `docker debug` where available. *(See Security.)*

**38. How do you run containers securely?**
Non-root user, read-only root filesystem, dropped capabilities, no privileged mode, resource limits, scanned and minimal images, and no Docker socket mounts. *(See Security.)*

**39. Docker in production: when is Compose not enough?**
When you need scheduling across many hosts, rolling deploys with health-based rollback, service discovery across machines, autoscaling, or self-healing across host failures. Use Kubernetes or ECS. *(See Compose and the Kubernetes and AWS sections.)*

## Scenario questions

**40. A service intermittently fails with "connection refused" to its database. Walk through the checks.**
1. Confirm the database is healthy and listening (`docker exec db pg_isready`).
2. Check the containers share a user-defined network and the name resolves (`getent hosts db`).
3. Confirm the connection uses the container port, not the host-published port.
4. Check whether the app started before the database was ready; add a health-based `depends_on`.
5. Check the database's connection limit and the app's connection pool.

**41. Production database container was accidentally removed with `docker compose down -v`. What now?**
Stop further writes. Identify the newest off-host backup, restore into a new named volume, start the database, verify data, and reconnect. Afterwards: protect the volume with a label and a Compose guard, and restrict who can run destructive commands.

**42. How would you collect logs from 50 containers across 5 hosts?**
A log shipper (Fluent Bit or Filebeat) on each host reading the JSON log files or using the Docker log driver, sending to a central store such as Elasticsearch, Loki or CloudWatch Logs. Standard fields (service, env, version, trace ID), rotation on every container, and retention per environment.

**43. Your container uses increasing memory over days and eventually restarts. What do you do?**
Check `docker stats` for the trend, look at the JVM heap and GC logs or the process RSS, take a heap dump on OOM (`-XX:+HeapDumpOnOutOfMemoryError`), and analyse it. Confirm the limit is not simply too low for the workload before assuming a leak.

## Quick-fire

- **Layer cache invalidation?** Any change to an instruction or its inputs invalidates that layer and every layer after it.
- **`docker stop` vs `docker kill`?** Stop sends SIGTERM and waits 10 s by default; kill sends SIGKILL immediately.
- **Health check states?** `starting`, `healthy`, `unhealthy`.
- **Rootless Docker?** Runs the daemon as a regular user, reducing the impact of a daemon compromise.
- **Buildx?** Builder with multi-platform builds and advanced caching via BuildKit.
- **Image digest?** Immutable content hash, safer than a mutable tag for production.
- **Docker context?** A named endpoint for a remote daemon, switched with `docker context use`.
- **OCI?** The open standards for image format and runtime that Docker follows.
