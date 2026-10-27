# Kubernetes: Security, RBAC and Pod Security

Kubernetes security works in layers: who can call the API (authentication and RBAC), what a pod is allowed to do on the node (Pod Security), and which pods can talk to which (NetworkPolicy). Secret handling is covered on the ConfigMaps and Secrets page.

## Authentication and authorization

Every request to the API server is authenticated (who are you?) and then authorized by **RBAC** (are you allowed to do this?).

| Object | Scope | Purpose |
|---|---|---|
| **ServiceAccount** | Namespace | Identity for pods and automation |
| **Role** | Namespace | A set of permissions inside one namespace |
| **ClusterRole** | Cluster | Permissions that apply cluster-wide, or are reused across namespaces |
| **RoleBinding** | Namespace | Grants a Role or ClusterRole to users, groups or ServiceAccounts in one namespace |
| **ClusterRoleBinding** | Cluster | Grants a ClusterRole across the whole cluster |

## Least-privilege example

A CI job should be able to update Deployments in one namespace, and nothing else.

```yaml
# rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ci-deployer
  namespace: team-orders
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: team-orders
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-deployer-binding
  namespace: team-orders
subjects:
  - kind: ServiceAccount
    name: ci-deployer
    namespace: team-orders
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f rbac.yaml

# Check what the account can do
kubectl auth can-i update deployments -n team-orders \
  --as=system:serviceaccount:team-orders:ci-deployer
kubectl auth can-i delete secrets -n team-orders \
  --as=system:serviceaccount:team-orders:ci-deployer
```

```output
yes
no
```

## Pods use ServiceAccounts too

By default a pod gets the `default` ServiceAccount. Give each app its own, and stop mounting a token when the app does not call the API.

```yaml
spec:
  serviceAccountName: orders
  automountServiceAccountToken: false
  containers:
    - name: orders
      image: my-registry/orders-service:1.0
```

On EKS, a ServiceAccount can also be linked to an IAM role so that the pod gets AWS permissions without access keys. See the EKS page.

## Pod Security Standards

Pod Security admission enforces three levels per namespace: `privileged`, `baseline`, and `restricted`. Use `restricted` for application namespaces.

```bash
kubectl label namespace team-orders \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted
```

A pod that satisfies `restricted` looks like this:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: orders
      image: my-registry/orders-service:1.0
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
```

## NetworkPolicy: default deny

Start each namespace with a deny-all policy, then open only the flows you need. See the Services page for an allow rule.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: team-orders
spec:
  podSelector: {}          # all pods in the namespace
  policyTypes:
    - Ingress
```

## Image security

- Pull images only from a trusted registry (for example Amazon ECR) and scan them on push.
- Use immutable tags or digests (`image: repo@sha256:...`), not `latest`.
- Sign images (cosign) and enforce the signature with an admission controller such as Kyverno or Gatekeeper.

```yaml
# Kyverno: block images that use the latest tag
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  rules:
    - name: require-tag
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Using the 'latest' tag is not allowed."
        pattern:
          spec:
            containers:
              - image: "!*:latest"
```

## Audit checklist

```bash
kubectl auth can-i --list -n team-orders                 # what am I allowed to do?
kubectl get clusterrolebindings -o wide | grep -i admin  # who has cluster-admin?
kubectl get pods -A -o jsonpath='{range .items[?(@.spec.hostNetwork==true)]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'
```

## Key takeaways

- RBAC: Role plus RoleBinding for one namespace; ClusterRole for the whole cluster.
- Give every workload its own ServiceAccount with only the permissions it needs.
- Enforce the `restricted` Pod Security level on application namespaces.
- Start from default-deny network policy and allow traffic explicitly.
- Use immutable image tags and scan or sign images.
