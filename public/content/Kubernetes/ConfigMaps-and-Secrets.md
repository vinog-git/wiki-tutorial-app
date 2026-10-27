# Kubernetes: ConfigMaps and Secrets

The 12-Factor rule is to keep configuration out of the image. Kubernetes gives you two objects for this: **ConfigMap** for ordinary settings and **Secret** for sensitive values. Both are injected into pods as environment variables or as files.

| | ConfigMap | Secret |
|---|---|---|
| Holds | Non-sensitive config (URLs, feature flags, log level) | Passwords, tokens, keys, certificates |
| Storage | Plain text in etcd | Base64-encoded in etcd (encrypt etcd at rest for real protection) |
| Size limit | 1 MiB | 1 MiB |

> Base64 is an encoding, not encryption. Anyone with `get secret` permission can read the value. Use RBAC to limit access and enable encryption at rest.

## ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orders-config
data:
  SPRING_PROFILES_ACTIVE: "prod"
  LOG_LEVEL: "INFO"
  PAYMENT_URL: "http://payments.default.svc.cluster.local"
  application.yaml: |
    server:
      port: 8080
    management:
      endpoints:
        web:
          exposure:
            include: health,info,prometheus
```

```bash
kubectl apply -f configmap.yaml
kubectl describe configmap orders-config
```

## Secret

Create one from the command line so the plain value never sits in a file in git:

```bash
kubectl create secret generic orders-db \
  --from-literal=username=orders_app \
  --from-literal=password='S3cure!Pass'
```

Or as YAML, with values already base64-encoded:

```bash
echo -n 'S3cure!Pass' | base64      # UzNjdXJlIVBhc3M=
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: orders-db
type: Opaque
data:
  username: b3JkZXJzX2FwcA==
  password: UzNjdXJlIVBhc3M=
```

```bash
kubectl get secret orders-db -o jsonpath='{.data.password}' | base64 -d
```

```output
S3cure!Pass
```

## Using them in a Deployment

### As environment variables

```yaml
spec:
  containers:
    - name: orders
      image: my-registry/orders-service:1.0
      envFrom:
        - configMapRef:
            name: orders-config          # every key becomes an env var
      env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: orders-db
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: orders-db
              key: password
```

### As a mounted file

Use this for config files such as `application.yaml`. Mounted files update when the ConfigMap changes (environment variables do not).

```yaml
spec:
  containers:
    - name: orders
      image: my-registry/orders-service:1.0
      volumeMounts:
        - name: config
          mountPath: /config
          readOnly: true
  volumes:
    - name: config
      configMap:
        name: orders-config
        items:
          - key: application.yaml
            path: application.yaml
```

The app then reads `/config/application.yaml`, for example with `SPRING_CONFIG_LOCATION=file:/config/application.yaml`.

## Rolling out a config change

Environment variables are read only at container start, so a new ConfigMap does not reach running pods. Force a rollout after changing it:

```bash
kubectl apply -f configmap.yaml
kubectl rollout restart deployment/orders
kubectl rollout status deployment/orders
```

## Secrets in production

- **Enable encryption at rest** for etcd. Managed clusters (EKS, GKE, AKS) support a KMS key for this.
- **Use RBAC** to restrict who can read Secrets. See the Security page.
- **Keep secrets out of git.** Use a sealed-secrets controller, or sync from an external store with the **External Secrets Operator** (AWS Secrets Manager, HashiCorp Vault).

```yaml
# External Secrets Operator: pulls from AWS Secrets Manager into a Kubernetes Secret
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: orders-db
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: orders-db              # the Kubernetes Secret it creates
  dataFrom:
    - extract:
        key: prod/orders/db      # the AWS secret name
```

## Key takeaways

- ConfigMaps for settings, Secrets for credentials; both are injected into pods.
- Base64 is not encryption. Turn on encryption at rest and restrict access with RBAC.
- Env vars need a pod restart to change; mounted files update automatically.
- Do not commit Secret values to git. Use an external secret store.
