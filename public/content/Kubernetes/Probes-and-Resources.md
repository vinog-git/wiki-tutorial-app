# Kubernetes: Health Probes, Resource Requests and Limits

Kubernetes can only keep an app healthy if it knows what healthy means. **Probes** tell it whether a container is alive, ready for traffic, or still starting. **Requests and limits** tell the scheduler how much CPU and memory to reserve and how much a container may use.

## The three probes

| Probe | Question it answers | If it fails |
|---|---|---|
| **Liveness** | Is the process stuck or dead? | kubelet restarts the container |
| **Readiness** | Can this pod take traffic right now? | Pod is removed from Service endpoints (no restart) |
| **Startup** | Has a slow app finished starting? | Other probes are paused until it passes; failure restarts the container |

A common mistake is making the liveness probe check a database or another service. If the database is down, every pod restarts and the outage gets worse. Liveness should only check the process itself.

## Probes with a working example

Spring Boot exposes `/actuator/health/liveness` and `/actuator/health/readiness` when `management.endpoint.health.probes.enabled=true`. Adjust the paths for your app.

```yaml
# deployment.yaml (container section)
containers:
  - name: orders
    image: my-registry/orders-service:1.0
    ports:
      - containerPort: 8080
    startupProbe:              # gives the app up to 60 seconds to start
      httpGet:
        path: /actuator/health/liveness
        port: 8080
      periodSeconds: 5
      failureThreshold: 12
    readinessProbe:
      httpGet:
        path: /actuator/health/readiness
        port: 8080
      periodSeconds: 10
      failureThreshold: 3
    livenessProbe:
      httpGet:
        path: /actuator/health/liveness
        port: 8080
      periodSeconds: 20
      timeoutSeconds: 2
      failureThreshold: 3
```

Probe types besides `httpGet` are `tcpSocket` (port open) and `exec` (run a command and check exit code).

```bash
kubectl describe pod -l app=orders | grep -A3 -i "readiness\|liveness"
kubectl get pods -l app=orders
```

```output
    Readiness:  http-get http://:8080/actuator/health/readiness delay=0s timeout=1s period=10s #success=1 #failure=3
    Liveness:   http-get http://:8080/actuator/health/liveness delay=0s timeout=2s period=20s #success=1 #failure=3
NAME                      READY   STATUS    RESTARTS   AGE
orders-6d8f7c9b5-4xk2p    1/1     Running   0          4m
```

## Requests and limits

- **requests**: what the scheduler reserves on a node. A pod only fits on a node with enough unreserved capacity.
- **limits**: the maximum a container can use.
  - CPU over the limit is **throttled** (the process slows down).
  - Memory over the limit **kills** the container (`OOMKilled`).

```yaml
resources:
  requests:
    cpu: "250m"        # a quarter of one core
    memory: "256Mi"
  limits:
    cpu: "1"
    memory: "512Mi"
```

CPU is in cores (`1` = one core, `250m` = 0.25 core). Memory uses `Mi` and `Gi` (binary units).

## QoS classes

Kubernetes assigns a Quality of Service class based on your settings. When a node runs short of memory, it evicts lower classes first.

| Class | Condition | Eviction priority |
|---|---|---|
| **Guaranteed** | Every container has requests equal to limits (CPU and memory) | Last |
| **Burstable** | Some requests or limits set, but not all equal | Middle |
| **BestEffort** | No requests or limits | First |

For critical services use Guaranteed, or at least always set requests.

## Namespace defaults

A `LimitRange` sets defaults for pods that forget to set resources. A `ResourceQuota` caps the total for a namespace.

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
  namespace: team-orders
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      default:
        cpu: "500m"
        memory: "512Mi"
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-orders-quota
  namespace: team-orders
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    pods: "50"
```

## Keeping pods up during maintenance

A **PodDisruptionBudget** limits how many pods voluntary actions (node drains, cluster upgrades) may take down at once.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-pdb
spec:
  minAvailable: 2          # always keep at least 2 orders pods running
  selector:
    matchLabels:
      app: orders
```

```bash
kubectl drain node-1 --ignore-daemonsets   # respects the PDB
```

## Graceful shutdown

When a pod is deleted, Kubernetes sends `SIGTERM`, waits `terminationGracePeriodSeconds` (default 30), then sends `SIGKILL`. Use this window to finish in-flight requests. Remove the pod from the load balancer first, usually with a short `preStop` sleep so endpoint updates reach the Ingress before the app stops accepting connections.

```yaml
spec:
  terminationGracePeriodSeconds: 45
  containers:
    - name: orders
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 10"]
```

## Key takeaways

- Liveness restarts a broken process; readiness controls traffic; startup protects slow starters.
- Never let liveness depend on external services.
- Requests decide where a pod fits; limits decide what happens when it overuses.
- Memory over limit means OOMKilled; CPU over limit means throttling.
- Use PodDisruptionBudgets so maintenance does not take down the whole service.
