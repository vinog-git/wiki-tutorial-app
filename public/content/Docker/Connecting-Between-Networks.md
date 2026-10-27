# Docker: Connecting Between Networks

Containers on different networks cannot see each other by default. That is a feature for isolation, but applications eventually need to cross boundaries: a web tier calling a payments network, a container on your laptop reaching a database on another machine, two Compose projects sharing a service, or two hosts running containers that must talk. This page covers the patterns, from the simplest to multi-host.

## Decision table

| You need | Use |
|---|---|
| Two containers on one host, on different networks, to talk | Attach one container to both networks |
| A container to reach another project's service on the same host | Shared external network |
| Containers on different hosts to talk | Overlay network (Swarm) or routed network over a VPN / VPC |
| Containers to reach a service outside Docker | Host gateway, extra host entry, or published port |
| Traffic between networks to be filtered | Put a proxy or firewall container in both networks, or use firewall rules |

## 1. Attach one container to two networks

The simplest and most common pattern. The **bridge container** has an interface in each network and is the only path between them.

```bash
docker network create frontend
docker network create backend

docker run -d --name api --network backend orders-service:1.0
docker run -d --name web --network frontend -p 80:80 nginx:1.27

# Give the web container a leg in the backend network so it can call the API
docker network connect backend web

docker run --rm --network frontend alpine sh -c 'apk add -q curl && curl -s http://api:8080/health'
```

```output
{"status":"UP"}
```

Note that the `alpine` container on `frontend` reaches `api` through `web` only if `web` proxies the request. Attaching `web` to `backend` lets `web` reach `api`; it does not forward traffic from `frontend` to `api` by itself. For the forwarding case, configure nginx as a reverse proxy (below).

### Reverse proxy as the bridge

Put a reverse proxy on both networks. Clients only see the proxy; the proxy forwards to the internal service by name.

```nginx
# nginx.conf
server {
    listen 80;
    location /api/ {
        proxy_pass http://api:8080/;          # resolved on the backend network
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

```bash
docker run -d --name gateway --network frontend -p 80:80 \
  -v "$(pwd)/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27
docker network connect backend gateway
curl -s localhost/api/health
```

This is the standard approach: the API is never on the front network, and the gateway is the only route in.

## 2. Shared external network across Compose projects

Two Compose projects on the same host can share a network that one of them creates.

```bash
docker network create --driver bridge shared-services
```

Project A (`payments/docker-compose.yml`):

```yaml
services:
  payments:
    image: payments-service:1.0
    networks: [shared-services]

networks:
  shared-services:
    external: true
```

Project B (`orders/docker-compose.yml`):

```yaml
services:
  orders:
    image: orders-service:1.0
    environment:
      PAYMENTS_URL: http://payments:8080      # resolved through shared-services
    networks: [shared-services, default]

networks:
  shared-services:
    external: true
```

```bash
cd payments && docker compose up -d
cd ../orders && docker compose up -d
docker exec orders-orders-1 wget -qO- http://payments:8080/health
```

```output
{"status":"UP"}
```

Without `external: true`, Compose creates a project-prefixed network (`orders_shared-services`), and the two projects cannot see each other.

## 3. Share a network namespace

`--network container:<name>` makes a new container use the same network namespace as another container. Both see the same `localhost` and ports. This is what Kubernetes pods do internally, and it is useful for debugging:

```bash
docker run -d --name api orders-service:1.0
docker run -it --rm --network container:api nicolaka/netshoot   # tools in api's network namespace
ss -tlnp            # shows the sockets api has open
curl -s localhost:8080/actuator/health
```

Use it for debugging, not as a general pattern; it couples the containers' lifecycles.

## 4. Reach a host service from a container

If the database runs directly on the host (not in Docker), containers need the host's address:

```bash
# Docker Desktop (macOS, Windows): built in
docker run --rm alpine ping -c 1 host.docker.internal

# Linux: map the name to the host gateway
docker run --rm --add-host=host.docker.internal:host-gateway alpine ping -c 1 host.docker.internal
```

In Compose:

```yaml
services:
  api:
    image: orders-service:1.0
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      DB_URL: jdbc:postgresql://host.docker.internal:5432/orders
```

The host database must listen on an address the container can reach. On Linux, `listen_addresses = '*'` in PostgreSQL plus a `pg_hba.conf` rule for the Docker bridge subnet (`172.16.0.0/12` is a common default range).

## 5. Reach a container from outside the host

Publishing a port is the usual answer:

```bash
docker run -d -p 8080:8080 orders-service:1.0    # reachable from the LAN via the host's IP
```

For a different host or a private network, route traffic to the host's published port through the network's firewall or load balancer, rather than publishing databases or internal services.

## 6. Multi-host: overlay networks

An **overlay** network spans Docker hosts. Containers on different machines share one network with DNS, and traffic is encrypted when you ask for it. Overlay needs a cluster mode such as Swarm or a Kubernetes CNI.

```bash
# On the Swarm manager
docker swarm init --advertise-addr 10.0.0.10
docker network create --driver overlay --attachable --opt encrypted app-overlay

# On a worker
docker swarm join --token <token> 10.0.0.10:2377

docker service create --name api --network app-overlay --replicas 3 orders-service:1.0
docker service create --name cache --network app-overlay redis:7
```

Overlay needs ports open between hosts: TCP 2377 (cluster management), TCP and UDP 7946 (node gossip), and UDP 4789 (VXLAN data).

For most teams today, multi-host Docker is done by Kubernetes (EKS, GKE, AKS), where a CNI plugin provides the overlay (see the Kubernetes section).

## 7. Multi-host: routed networks over a VPN or VPC

When you run Docker on several VMs in a cloud VPC, or connect a laptop to a server, you can often route the Docker subnets directly:

- Give each host a non-overlapping subnet with `default-address-pools` in `/etc/docker/daemon.json`.
- Connect the hosts with a VPN (WireGuard, Tailscale) or a VPC peering / Transit Gateway.
- Add static routes so each host sends the other subnet's traffic to the peer.

```json
{
  "default-address-pools": [
    { "base": "172.20.0.0/16", "size": 24 }
  ]
}
```

Non-overlapping subnets are the key. If two hosts both use `172.17.0.0/16`, the routing cannot tell them apart.

## 8. Filtering traffic between networks

Do not assume two networks are isolated because they are separate. Control what crosses:

- A container attached to both networks is a route between them. Keep the number of such containers small.
- For fine-grained control, put a firewall or proxy container in the middle.
- On the host, use `DOCKER-USER` iptables rules to restrict forwarded traffic:

```bash
# Only allow the frontend subnet to reach the backend API port
sudo iptables -I DOCKER-USER -s 172.18.0.0/16 -d 172.19.0.0/16 -j DROP
sudo iptables -I DOCKER-USER -s 172.18.0.0/16 -d 172.19.0.0/16 -p tcp --dport 8080 -j ACCEPT
sudo iptables -L DOCKER-USER -n --line-numbers
```

Check the subnets with `docker network inspect`. Rules are evaluated top to bottom and `-I` inserts at the top, so the DROP is inserted first and the ACCEPT second, which places the ACCEPT above it. The `--line-numbers` listing shows the final order. Use `-A` to append instead, and then the order is the reverse.

## Testing a cross-network connection

```bash
# Which networks is this container on?
docker inspect -f '{{json .NetworkSettings.Networks}}' api | python3 -m json.tool | grep -E '"[a-z-]+":'

# Can it resolve and reach the target?
docker exec api getent hosts payments
docker exec api sh -c 'nc -zv payments 8080'
```

| Symptom | Likely cause |
|---|---|
| `Could not resolve host` | Source and target share no user-defined network, or the target's name differs |
| Resolves but times out | Target network has no route; filtering rule; target not listening on `0.0.0.0` |
| Works from host, not from container | Published port bound to 127.0.0.1, or the container is on another network |
| Works one way only | Return route missing on a routed setup, or a stateful firewall rule |

## Key takeaways

- The simplest cross-network pattern is one container on both networks, usually a reverse proxy or gateway.
- Share a network between Compose projects with `external: true`.
- Reach host services with `host.docker.internal` (Linux: `host-gateway`).
- Multi-host needs overlay networks (Swarm), a Kubernetes CNI, or a routed setup with non-overlapping subnets.
- Attaching a container to two networks creates a route between them; treat that as a security decision.
