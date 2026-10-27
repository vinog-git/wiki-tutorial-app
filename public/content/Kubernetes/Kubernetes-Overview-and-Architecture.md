# Kubernetes: Overview and Architecture

Kubernetes (K8s) is an open-source system that runs containers across a group of machines. You describe the state you want (for example, "3 copies of this image, reachable on port 80"), and Kubernetes keeps the real cluster matching that description. It restarts crashed containers, reschedules work when a machine dies, and rolls out new versions gradually.

## Why Kubernetes?

| Problem | What Kubernetes does |
|---|---|
| Running many containers on many hosts | Schedules them onto nodes with free CPU and memory |
| A container crashes | Restarts it (self-healing) |
| A host dies | Recreates the pods on another node |
| Traffic grows | Scales replicas up and down |
| Deploying a new version | Rolling updates and rollbacks |
| Services need to find each other | Built-in DNS and load balancing |

## Architecture

A cluster has two kinds of machines: the **control plane** (the brain) and **worker nodes** (where your containers run).

```
  Control plane:  kube-apiserver · etcd · kube-scheduler · kube-controller-manager
                                    │ (watches and commands)
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌──────────────┐           ┌──────────────┐           ┌──────────────┐
│   Node 1     │           │   Node 2     │           │   Node 3     │
│ kubelet      │           │ kubelet      │           │ kubelet      │
│ kube-proxy   │           │ kube-proxy   │           │ kube-proxy   │
│ container    │           │ container    │           │ container    │
│ runtime      │           │ runtime      │           │ runtime      │
│ [pod][pod]   │           │ [pod]        │           │ [pod][pod]   │
└──────────────┘           └──────────────┘           └──────────────┘
```

### Control plane components

| Component | Responsibility |
|---|---|
| **kube-apiserver** | The only entry point to the cluster. Every `kubectl` command and every component talks to it over REST. |
| **etcd** | Consistent key-value store that holds all cluster state. Back it up in production. |
| **kube-scheduler** | Picks a node for each new pod based on resources, affinity, and taints. |
| **kube-controller-manager** | Runs control loops (ReplicaSet, Node, Job, and others) that move the actual state toward the desired state. |
| **cloud-controller-manager** | Talks to the cloud provider for load balancers, nodes, and volumes (EKS, GKE, AKS). |

### Node components

| Component | Responsibility |
|---|---|
| **kubelet** | Agent on each node. Makes sure the containers described in the pod specs are running and healthy. |
| **kube-proxy** | Programs network rules so Service IPs reach the right pods. |
| **Container runtime** | Runs containers. Modern clusters use containerd (Docker itself is no longer used as the runtime). |

## Core objects

| Object | Purpose |
|---|---|
| **Pod** | Smallest deployable unit. One or more containers sharing a network and storage. |
| **ReplicaSet** | Keeps N identical pods running. |
| **Deployment** | Manages ReplicaSets, rolling updates, and rollbacks. This is what you use most of the time. |
| **Service** | Stable IP and DNS name in front of a changing set of pods. |
| **Ingress** | HTTP routing from outside the cluster to Services. |
| **ConfigMap / Secret** | Configuration and sensitive values, injected into pods. |
| **PersistentVolumeClaim** | A request for storage that outlives a pod. |
| **Namespace** | A logical partition inside a cluster (for teams or environments). |

## Declarative model

Kubernetes is **declarative**. You write YAML that says what you want, apply it, and the controllers do the work.

```bash
kubectl apply -f deployment.yaml   # create or update to match the file
kubectl get deployments            # see what exists
kubectl describe pod <name>        # see events and why something is failing
```

## Try it locally: a 1-node cluster with kind

[kind](https://kind.sigs.k8s.io/) runs a Kubernetes cluster inside Docker. You need Docker, `kind`, and `kubectl` installed.

```bash
kind create cluster --name demo
kubectl cluster-info --context kind-demo
kubectl get nodes
```

```output
Creating cluster "demo" ...
 ✓ Ensuring node image (kindest/node:v1.30.0) 🖼
 ✓ Preparing nodes 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
NAME                 STATUS   ROLES           AGE   VERSION
demo-control-plane   Ready    control-plane   40s   v1.30.0
```

Delete it when you are done:

```bash
kind delete cluster --name demo
```

## Key takeaways

- The **API server** is the single front door; everything else reads and writes through it.
- **etcd** is the source of truth. Controllers watch it and act on differences.
- You manage **Deployments**, not bare pods. Pods are disposable and get replaced.
- Work is declared in YAML and applied with `kubectl apply`.
