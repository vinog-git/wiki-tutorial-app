# Kubernetes: Pods, ReplicaSets and Deployments

## Pod

A **pod** wraps one or more containers that share an IP address, a network namespace, and storage volumes. Most pods run a single container. Pods are disposable: when one dies, Kubernetes creates a new one with a new name and IP.

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello
  labels:
    app: hello
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
```

```bash
kubectl apply -f pod.yaml
kubectl get pod hello -o wide
kubectl port-forward pod/hello 8080:80   # open http://localhost:8080
kubectl delete pod hello
```

```output
pod/hello created
NAME    READY   STATUS    RESTARTS   AGE   IP           NODE
hello   1/1     Running   0          8s    10.244.0.5   demo-control-plane
```

A bare pod is not restarted on another node if its node dies. Use a Deployment for anything that must stay running.

### Multi-container pods

Containers in the same pod share `localhost`. Use this for a helper that is tightly coupled to the main app, such as a log shipper or a sidecar proxy.

```yaml
spec:
  containers:
    - name: app
      image: my-registry/orders-service:1.0
      ports:
        - containerPort: 8080
    - name: log-shipper
      image: fluent/fluent-bit:3.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
  volumes:
    - name: logs
      emptyDir: {}
```

## Deployment

A **Deployment** manages a **ReplicaSet**, and the ReplicaSet manages the pods. You change the Deployment; it handles the rollout.

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orders          # must match the pod template labels below
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # at most 1 extra pod during an update
      maxUnavailable: 0    # never drop below 3 ready pods
  template:
    metadata:
      labels:
        app: orders
    spec:
      containers:
        - name: orders
          image: my-registry/orders-service:1.0
          ports:
            - containerPort: 8080
```

```bash
kubectl apply -f deployment.yaml
kubectl rollout status deployment/orders
kubectl get deploy,rs,pods -l app=orders
```

```output
deployment.apps/orders created
Waiting for deployment "orders" rollout to finish: 0 of 3 updated replicas are available...
deployment "orders" successfully rolled out

NAME                     READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/orders   3/3     3            3           25s

NAME                               DESIRED   CURRENT   READY   AGE
replicaset.apps/orders-6d8f7c9b5   3         3         3       25s

NAME                         READY   STATUS    RESTARTS   AGE
pod/orders-6d8f7c9b5-4xk2p   1/1     Running   0          25s
pod/orders-6d8f7c9b5-7tq9w   1/1     Running   0          25s
pod/orders-6d8f7c9b5-n8vzl   1/1     Running   0          25s
```

Kill a pod and watch the ReplicaSet replace it:

```bash
kubectl delete pod orders-6d8f7c9b5-4xk2p
kubectl get pods -l app=orders
```

## Scaling, updating and rolling back

```bash
# Scale
kubectl scale deployment/orders --replicas=5

# Rolling update to a new image
kubectl set image deployment/orders orders=my-registry/orders-service:1.1
kubectl rollout status deployment/orders

# Inspect history and roll back
kubectl rollout history deployment/orders
kubectl rollout undo deployment/orders
```

```output
deployment.apps/orders image updated
Waiting for deployment "orders" rollout to finish: 1 out of 3 new replicas have been updated...
deployment "orders" successfully rolled out
```

Each change creates a new ReplicaSet. The old one is kept (scaled to 0) so `rollout undo` can switch back quickly. Limit the history with `spec.revisionHistoryLimit`.

## Other workload types

| Kind | Use it for |
|---|---|
| **StatefulSet** | Pods that need a stable name and their own storage (databases, Kafka, ZooKeeper). Pods are `db-0`, `db-1`, and so on. |
| **DaemonSet** | One pod on every node (log agents, monitoring agents, CNI plugins). |
| **Job** | Run a task to completion (a batch import, a database migration). |
| **CronJob** | Run a Job on a schedule. |

```yaml
# cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-report
spec:
  schedule: "0 2 * * *"            # 02:00 every day
  concurrencyPolicy: Forbid        # do not start a run while the last is still going
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: my-registry/report-job:1.0
```

## Key takeaways

- Pods are disposable; never depend on a pod's name or IP.
- A Deployment gives you replicas, rolling updates, and `rollout undo`.
- `selector.matchLabels` must match the pod template labels, or the apply fails.
- Use StatefulSets for stable identity, DaemonSets for per-node agents, Jobs and CronJobs for batch work.
