# Kubernetes: Helm and Kustomize

Real applications need many YAML files: Deployment, Service, Ingress, ConfigMap, HPA, and more, each with different values per environment. Two tools manage that:

- **Helm** packages YAML as a templated **chart** with a `values.yaml` file. Good for installing third-party software and for reusable app templates.
- **Kustomize** (built into `kubectl`) layers plain YAML with **overlays** per environment. No templates, so the files stay valid YAML.

## Helm

### Install software from a chart

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo bitnami/redis
helm install cache bitnami/redis --namespace data --create-namespace \
  --set architecture=standalone --set auth.password='change-me'
helm list -n data
```

```output
NAME    NAMESPACE   REVISION   STATUS     CHART          APP VERSION
cache   data        1          deployed   redis-20.x.x   7.4.x
```

### Create your own chart

```bash
helm create orders
tree orders
```

```output
orders
├── Chart.yaml
├── values.yaml
└── templates
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    └── _helpers.tpl
```

Replace `values.yaml` with the settings you want to vary:

```yaml
# values.yaml
replicaCount: 2
image:
  repository: my-registry/orders-service
  tag: "1.0"
service:
  port: 80
  targetPort: 8080
resources:
  requests:
    cpu: 250m
    memory: 256Mi
```

Templates read those values:

```yaml
# templates/deployment.yaml (excerpt)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-orders
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}-orders
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}-orders
    spec:
      containers:
        - name: orders
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: {{ .Values.service.targetPort }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

Render and install:

```bash
helm template orders ./orders | less      # preview the final YAML without installing
helm lint ./orders
helm install orders ./orders -n team-orders --create-namespace
helm upgrade orders ./orders -n team-orders --set image.tag=1.1
helm history orders -n team-orders
helm rollback orders 1 -n team-orders     # back to revision 1
```

```output
Release "orders" has been upgraded. Happy Helming!
REVISION   UPDATED                    STATUS       CHART         DESCRIPTION
1          Mon Oct 26 10:12:01 2026   superseded   orders-0.1.0  Install complete
2          Mon Oct 26 10:18:44 2026   deployed     orders-0.1.0  Upgrade complete
```

### Per-environment values

```bash
helm upgrade --install orders ./orders -n prod -f values-prod.yaml
```

```yaml
# values-prod.yaml
replicaCount: 5
resources:
  requests:
    cpu: "1"
    memory: 1Gi
```

## Kustomize

Kustomize keeps a `base` with the common YAML and `overlays` that patch it for each environment.

```
orders/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    │   └── kustomization.yaml
    └── prod/
        └── kustomization.yaml
```

```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
```

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: prod
resources:
  - ../../base
images:
  - name: my-registry/orders-service
    newTag: "1.0"
replicas:
  - name: orders
    count: 5
patches:
  - target:
      kind: Deployment
      name: orders
    patch: |-
      - op: add
        path: /metadata/labels/env
        value: prod
```

```bash
kubectl kustomize overlays/prod | head -20   # print the rendered YAML
kubectl apply -k overlays/prod               # build and apply in one step
```

## Helm or Kustomize?

| Situation | Choose |
|---|---|
| Installing third-party software (databases, ingress controllers) | Helm |
| Publishing a reusable template for many teams | Helm |
| Your own app with a few environment differences | Kustomize |
| Need conditionals, loops, or packaging versions | Helm |
| Want plain YAML that reviewers can read as-is | Kustomize |

Many teams use both: Helm to install third-party charts, and Kustomize or Helm for their own apps. GitOps tools such as Argo CD and Flux support either.

## GitOps in one picture

```
git repo (desired state)  →  Argo CD / Flux watches it  →  applies to the cluster
                             and reports drift back
```

Commit the Helm values or Kustomize overlays to git. Argo CD compares them with the cluster and syncs the difference. Rollback becomes `git revert`.

## Key takeaways

- Helm: templates plus `values.yaml`; `helm upgrade --install` is idempotent and `helm rollback` is built in.
- Kustomize: base plus overlays; no templates; `kubectl apply -k`.
- Always `helm template` or `kubectl kustomize` to review rendered output before applying.
- Store desired state in git and let GitOps tools apply it.
