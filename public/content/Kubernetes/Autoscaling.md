# Kubernetes: Autoscaling (HPA, VPA, Cluster Autoscaler)

Kubernetes scales in two layers:

| Layer | Tool | What it changes |
|---|---|---|
| **Pods** | Horizontal Pod Autoscaler (HPA) | Number of replicas |
| **Pods** | Vertical Pod Autoscaler (VPA) | CPU and memory requests of each pod |
| **Nodes** | Cluster Autoscaler or Karpenter | Number of machines in the cluster |

HPA needs the **metrics-server** to report CPU and memory usage. Install it once:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl top pods
```

## HPA with CPU and memory

The Deployment must set `resources.requests`, because HPA computes utilization as a percentage of the request.

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70      # add pods when average CPU passes 70% of request
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300 # wait 5 minutes of low load before scaling in
```

```bash
kubectl apply -f hpa.yaml
kubectl get hpa orders
```

```output
NAME     REFERENCE           TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
orders   Deployment/orders   84%/70%   2         10        4          2m
```

With the target at 84% and 70% wanted, the HPA scales up. Run a load test to see it happen:

```bash
kubectl run load --rm -it --image=busybox --restart=Never -- \
  sh -c 'while true; do wget -q -O- http://orders/health; done'
kubectl get hpa orders -w
```

## HPA on custom metrics

CPU is a rough signal. For queue-based work, scale on the number of messages waiting. This needs a metrics adapter such as KEDA or the Prometheus Adapter.

```yaml
# KEDA ScaledObject: scale orders on an SQS queue depth
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: orders-worker
spec:
  scaleTargetRef:
    name: orders-worker
  minReplicaCount: 0          # KEDA can scale to zero
  maxReplicaCount: 20
  triggers:
    - type: aws-sqs-queue
      metadata:
        queueURL: https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue
        queueLength: "50"     # one replica per 50 messages
        awsRegion: us-east-1
```

## VPA: right-sizing requests

VPA watches real usage and recommends (or sets) requests. Start in `Off` mode to see recommendations without changing pods.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: orders-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders
  updatePolicy:
    updateMode: "Off"        # recommendations only
```

```bash
kubectl describe vpa orders-vpa | grep -A4 "Target"
```

Do not run HPA on CPU and VPA in `Auto` mode on the same metric, or they fight each other.

## Cluster Autoscaler and Karpenter

When pods are `Pending` because no node has room, a node autoscaler adds machines.

- **Cluster Autoscaler** works with existing node groups (AWS Auto Scaling groups). It adds nodes to a group when pods cannot be scheduled and removes idle nodes.
- **Karpenter** (AWS-built, open source) launches right-sized EC2 instances directly, chooses instance types on the fly, and consolidates underused nodes. It is faster and usually cheaper.

```yaml
# Karpenter NodePool (v1 API): on-demand or spot, ARM or x86
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: general
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  limits:
    cpu: "200"
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m
```

## Checking why pods are pending

```bash
kubectl get pods --field-selector=status.phase=Pending
kubectl describe pod <pending-pod> | grep -A5 Events
```

```output
Events:
  Type     Reason            Age   From               Message
  ----     ------            ----  ----               -------
  Warning  FailedScheduling  30s   default-scheduler  0/3 nodes are available: 3 Insufficient cpu.
```

`Insufficient cpu` means the node autoscaler should act. If the autoscaler is not adding nodes, check its logs and its IAM permissions.

## Key takeaways

- HPA changes replica count; it needs metrics-server and CPU requests set on the pods.
- Scale on queue depth (KEDA) for background workers, not only CPU.
- Run VPA in `Off` mode to read recommendations before letting it change pods.
- Cluster Autoscaler or Karpenter adds nodes when pods are Pending for lack of capacity.
