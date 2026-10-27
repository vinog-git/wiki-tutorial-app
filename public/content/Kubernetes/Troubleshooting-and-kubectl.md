# Kubernetes: Troubleshooting and kubectl Cheat Sheet

Most Kubernetes problems show up in three places: the pod status, the events, and the logs. Learn to read those three and you can solve most incidents quickly.

## First three commands

```bash
kubectl get pods -A | grep -v Running        # anything not healthy, all namespaces
kubectl describe pod <pod> -n <ns>           # events at the bottom explain most failures
kubectl logs <pod> -n <ns> --previous        # logs from the crashed container
```

## Common pod states

| Status | Typical cause | What to check |
|---|---|---|
| `Pending` | No node has enough CPU or memory, or a volume cannot bind | `describe pod` events: `Insufficient cpu`, `unbound PersistentVolumeClaim` |
| `ImagePullBackOff` / `ErrImagePull` | Wrong image name or tag, or no permission to pull | Image spelling; ECR permissions; `imagePullSecrets` |
| `CrashLoopBackOff` | Container starts and exits repeatedly | `logs --previous`; missing env var or config; failing liveness probe |
| `OOMKilled` (in Last State) | Container exceeded its memory limit | Raise the limit, or fix a memory leak |
| `Running` but `0/1 READY` | Readiness probe failing | Probe path and port; the app's health endpoint |
| `Terminating` for a long time | Finalizer or a node that is not responding | `describe pod`; node status |
| `Evicted` | Node ran low on memory or disk | `describe node`; node conditions |

## Example: CrashLoopBackOff

```bash
kubectl get pods -l app=orders
```

```output
NAME                      READY   STATUS             RESTARTS      AGE
orders-7c9d5b8f6-q2mzx    0/1     CrashLoopBackOff   5 (40s ago)   4m
```

```bash
kubectl logs orders-7c9d5b8f6-q2mzx --previous
```

```output
Caused by: java.lang.IllegalStateException: Could not resolve placeholder 'DB_PASSWORD'
```

The fix is to add the missing Secret reference (see the [ConfigMaps and Secrets](/Kubernetes/ConfigMaps-and-Secrets) page), then:

```bash
kubectl rollout restart deployment/orders
```

## Example: Pending because of resources

```bash
kubectl describe pod orders-5f8d9c7b4-hx2lp | tail -5
```

```output
Events:
  Type     Reason            Age   From               Message
  ----     ------            ----  ----               -------
  Warning  FailedScheduling  60s   default-scheduler  0/3 nodes are available: 3 Insufficient memory.
```

Either lower `requests.memory` for the pod or add capacity (the autoscaler page covers this).

## Debugging a running pod

```bash
kubectl exec -it <pod> -n <ns> -- sh                 # shell inside the container
kubectl port-forward pod/<pod> 8080:8080 -n <ns>     # reach the app from your laptop
kubectl cp <pod>:/var/log/app.log ./app.log -n <ns>  # copy a file out
```

If the image has no shell (distroless images), use an ephemeral debug container that shares the pod's network:

```bash
kubectl debug -it <pod> -n <ns> --image=busybox:1.36 --target=orders
```

## Checking Services and DNS

```bash
kubectl get endpoints orders                         # empty means the selector matches no ready pods
kubectl run dns --rm -it --image=busybox:1.36 --restart=Never -- \
  nslookup orders.default.svc.cluster.local
kubectl get events -n <ns> --sort-by=.lastTimestamp  # recent events in the namespace
```

## Nodes

```bash
kubectl get nodes -o wide
kubectl describe node <node> | grep -A8 Conditions   # MemoryPressure, DiskPressure, Ready
kubectl top nodes
kubectl cordon <node>        # stop new pods landing here
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
kubectl uncordon <node>      # back in service
```

## Handy kubectl commands

```bash
# Context and namespace
kubectl config get-contexts
kubectl config set-context --current --namespace=team-orders

# Listing
kubectl get all -n team-orders
kubectl get pods -o wide --sort-by=.status.startTime
kubectl get pods -l app=orders --show-labels

# Changing things
kubectl apply -f manifest.yaml
kubectl diff -f manifest.yaml                        # what would change
kubectl delete -f manifest.yaml
kubectl scale deploy/orders --replicas=3
kubectl rollout restart deploy/orders
kubectl rollout undo deploy/orders

# Explaining fields without reading docs
kubectl explain deployment.spec.strategy --recursive | head -30

# Resource usage
kubectl top pods -n team-orders
```

## Useful shortcuts

| Alias | Full name |
|---|---|
| `po` | pods |
| `deploy` | deployments |
| `svc` | services |
| `ing` | ingresses |
| `ns` | namespaces |
| `cm` | configmaps |
| `pvc` | persistentvolumeclaims |
| `hpa` | horizontalpodautoscalers |

Many teams add `alias k=kubectl` and tools such as **k9s** (a terminal UI) or **stern** (multi-pod log tailing) to speed this up.

## Troubleshooting order

1. **Is the pod running?** `kubectl get pods`
2. **What do the events say?** `kubectl describe pod`
3. **What did the app log?** `kubectl logs --previous`
4. **Can the Service reach it?** `kubectl get endpoints`
5. **Is the network allowed?** Check NetworkPolicies in the namespace
6. **Did something change?** `kubectl rollout history`, `helm history`, `git log`

## Key takeaways

- `describe` shows events; `logs --previous` shows why the last container died.
- Map the status to a cause with the table above before changing anything.
- `kubectl debug` and `port-forward` let you inspect pods without changing their spec.
- Use `cordon` and `drain` for node maintenance; `uncordon` puts it back.
