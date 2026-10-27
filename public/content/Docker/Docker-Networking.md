# Docker: Networking Basics

Each container gets its own network namespace, IP address and routing table. Docker provides networks to connect containers to each other, to the host, and to the outside world. Getting the network model right prevents most "connection refused" problems.

## Network drivers

| Driver | What it does | Use for |
|---|---|---|
| **bridge** (default) | Private virtual switch on the host (`docker0`); NAT to outside | Single-host apps |
| **user-defined bridge** | Same as bridge, plus **DNS by container name** | Almost always, for apps that talk to each other |
| **host** | Container shares the host's network stack; no isolation, no port mapping | Performance-critical or network tools (Linux only) |
| **none** | No network interface except loopback | Batch jobs with no network need |
| **overlay** | Spans multiple Docker hosts (Swarm, or with a key-value store) | Multi-host clusters |
| **macvlan** | Gives the container its own MAC and IP on the physical LAN | Containers that must look like physical hosts |

> The default `bridge` network does **not** provide DNS between containers. Always create a user-defined network for multi-container apps.

## The default bridge vs a user-defined network

```bash
docker network create app-net
docker run -d --name api --network app-net orders-service:1.0
docker run -d --name cache --network app-net redis:7
docker run --rm --network app-net alpine ping -c 2 cache
```

```output
PING cache (172.19.0.3): 56 data bytes
64 bytes from 172.19.0.3: seq=0 ttl=64 time=0.094 ms
...
```

`cache` resolves by name because `app-net` runs Docker's embedded DNS server. On the default bridge the same ping fails with `bad address 'cache'`.

## Inspect a network

```bash
docker network ls
docker network inspect app-net --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

```output
api 172.19.0.2/16
cache 172.19.0.3/16
```

## Publishing ports to the host

`EXPOSE` in a Dockerfile only documents a port. To reach it from the host you publish it:

```bash
docker run -d -p 8080:8080 orders-service:1.0      # host 8080 → container 8080 on all interfaces
docker run -d -p 127.0.0.1:8080:8080 orders-service:1.0   # only the local machine can connect
docker run -d -P orders-service:1.0                # publish every EXPOSEd port to random host ports
docker port api
```

```output
8080/tcp -> 0.0.0.0:8080
```

Security note: `-p 5432:5432` on a database exposes it to every network the host is on. Bind to `127.0.0.1` or do not publish it at all. Containers on the same user-defined network reach each other on the container port without publishing.

## Ports inside a container network

| From | To | Address to use |
|---|---|---|
| Container → container (same network) | `http://api:8080` | Service name and container port |
| Host → container | `http://localhost:8080` | Published host port |
| Container → host service | `http://host.docker.internal:5000` | Works on Docker Desktop; on Linux add `--add-host=host.docker.internal:host-gateway` |
| Container → internet | `https://api.example.com` | Through NAT on the host |

## Connect a running container to another network

A container can belong to several networks at once:

```bash
docker network create payments-net
docker network connect payments-net api
docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' api
docker network disconnect app-net api     # remove it from the first network
```

```output
app-net payments-net
```

Now `api` can reach services on both `app-net` and `payments-net`, while services on `payments-net` that are not attached to `app-net` cannot see the rest of `app-net`. This is how you separate tiers. For the detailed cross-network patterns, see Connecting Between Networks.

## Network isolation for security

Put each tier on its own network and attach a container only to what it needs:

```
public-net:   nginx (published 80)  ←→  api
backend-net:  api                   ←→  db, cache
data-net:     db, cache             (no published ports; no route to the internet)
```

```yaml
# docker-compose.yml excerpt
services:
  web:
    networks: [public]
  api:
    networks: [public, backend]
  db:
    networks: [backend]

networks:
  public:
  backend:
    internal: true      # no route to the outside world
```

`internal: true` blocks outbound internet access from that network. `api` can still reach `db`, but `db` cannot reach the internet.

## DNS and aliases

```bash
docker run -d --name db-primary --network app-net --network-alias db postgres:16
docker run --rm --network app-net alpine nslookup db
```

Several containers can share a network alias for simple load spreading (DNS round-robin).

## Firewall and iptables

Docker writes its own iptables rules, so a host firewall (ufw, firewalld) can be bypassed by published ports. Options:

- Publish only on `127.0.0.1` and put a reverse proxy in front.
- Use the `DOCKER-USER` iptables chain for rules that must apply to Docker traffic.
- In production, use cloud security groups or network policies in front of the host.

## Troubleshooting connectivity

```bash
docker exec api nslookup cache                    # does the name resolve?
docker exec api sh -c 'nc -zv cache 6379'         # is the port reachable? (install netcat in the image)
docker exec api cat /etc/resolv.conf              # which DNS server is used
docker network inspect app-net                    # which containers are attached
docker logs api 2>&1 | grep -i "connection refused"
```

| Symptom | Likely cause |
|---|---|
| `Name or service not known` | Not on the same user-defined network, or wrong name |
| `Connection refused` | Service not listening on that interface, or wrong port. Listen on `0.0.0.0`, not `127.0.0.1`, inside containers |
| Works from host, fails from another container | Publishing is for the host; containers should use the container port and service name |
| Works on laptop, fails on server | Firewall or iptables rules on the server; published port bound to 127.0.0.1 |

## Key takeaways

- Create user-defined networks; they give DNS by container name.
- Publish ports only where needed, and bind to `127.0.0.1` for local-only access.
- A container can join several networks; use that to separate tiers.
- `internal: true` networks have no route to the internet, which is useful for databases.
- Inside a container, listen on `0.0.0.0`, not `localhost`.
