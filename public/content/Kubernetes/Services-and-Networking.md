# Kubernetes: Services and Networking

Pods get new IP addresses every time they are replaced, so you never call a pod directly. A **Service** gives a set of pods one stable virtual IP and DNS name, and load-balances traffic across the pods that match its selector.

## Cluster networking rules

- Every pod gets its own IP address, and pods can reach each other without NAT.
- Containers in the same pod share `localhost`.
- A Service IP is virtual. `kube-proxy` (or the CNI plugin) rewrites traffic to a healthy pod.
- DNS inside the cluster: `<service>.<namespace>.svc.cluster.local`. Within the same namespace, `<service>` alone works.

## Service types

| Type | Reachable from | Typical use |
|---|---|---|
| **ClusterIP** (default) | Inside the cluster only | Service-to-service calls |
| **NodePort** | Every node's IP on a fixed port (30000-32767) | Dev and test, or on-prem with an external load balancer |
| **LoadBalancer** | Internet, via a cloud load balancer | Exposing a service directly on AWS, GCP, or Azure |
| **ExternalName** | Maps to an external DNS name | Pointing to a database or API outside the cluster |
| **Headless** (`clusterIP: None`) | DNS returns each pod IP | StatefulSets and client-side load balancing |

## ClusterIP Service with a working example

First, the Deployment from the previous page is running with the label `app: orders`. Expose it:

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: orders
spec:
  type: ClusterIP
  selector:
    app: orders            # sends traffic to pods with this label
  ports:
    - name: http
      port: 80             # the port clients use
      targetPort: 8080     # the port the container listens on
```

```bash
kubectl apply -f service.yaml
kubectl get svc orders
kubectl get endpoints orders
```

```output
service/orders created
NAME     TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
orders   ClusterIP   10.96.144.21   <none>        80/TCP    5s

NAME     ENDPOINTS                                   AGE
orders   10.244.0.8:8080,10.244.0.9:8080,10.244.0.10:8080   5s
```

Call it from a temporary pod in the same cluster:

```bash
kubectl run tmp --rm -it --image=curlimages/curl --restart=Never -- \
  curl -s http://orders.default.svc.cluster.local/health
```

## NodePort and LoadBalancer

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-public
spec:
  type: LoadBalancer      # on EKS this creates an AWS Network Load Balancer
  selector:
    app: orders
  ports:
    - port: 80
      targetPort: 8080
```

```bash
kubectl get svc orders-public
```

```output
NAME            TYPE           CLUSTER-IP     EXTERNAL-IP                                    PORT(S)        AGE
orders-public   LoadBalancer   10.96.201.5    a1b2c3-1234.elb.us-east-1.amazonaws.com        80:31245/TCP   90s
```

One LoadBalancer Service per app is expensive on a cloud provider. For many HTTP services, use an **Ingress** (next page) instead.

## Headless Service for StatefulSets

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kafka-headless
spec:
  clusterIP: None         # no virtual IP; DNS returns each pod
  selector:
    app: kafka
  ports:
    - port: 9092
```

Each pod then has a stable DNS name, for example `kafka-0.kafka-headless.default.svc.cluster.local`.

## Network policies

By default every pod can talk to every other pod. A **NetworkPolicy** restricts that. It only works if your CNI plugin supports it (Calico, Cilium, and the AWS VPC CNI with network policy enabled do).

```yaml
# Only pods labelled role=frontend may reach the orders pods on 8080
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: orders-allow-frontend
spec:
  podSelector:
    matchLabels:
      app: orders
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend
      ports:
        - protocol: TCP
          port: 8080
```

## Troubleshooting Services

Most "Service doesn't work" problems are a selector mismatch. Check that the endpoints list is not empty:

```bash
kubectl get endpoints orders          # empty means no pod matches the selector
kubectl get pods --show-labels        # compare labels with the Service selector
```

## Key takeaways

- Clients use the Service name; pods come and go behind it.
- `port` is what callers use, `targetPort` is what the container listens on.
- An empty Endpoints list means the selector matches no ready pods.
- Use ClusterIP internally, one Ingress for HTTP from outside, and NetworkPolicy to restrict traffic.
