# Kubernetes: Storage (PV, PVC, StorageClass)

Containers lose their filesystem when they restart. For data that must survive, Kubernetes separates the **request** for storage from the **provisioning** of it:

| Object | Who creates it | Meaning |
|---|---|---|
| **StorageClass** | Platform admin | A template: "fast SSD from the AWS EBS CSI driver" |
| **PersistentVolume (PV)** | Created by the provisioner (automatically) or an admin | A real piece of storage in the cluster |
| **PersistentVolumeClaim (PVC)** | Application developer | "I need 10Gi, read-write, once" |

A pod mounts the PVC. Kubernetes binds the claim to a matching volume.

## Access modes

| Mode | Short | Meaning |
|---|---|---|
| ReadWriteOnce | RWO | Mounted read-write by one node. Most block storage (EBS) is RWO. |
| ReadOnlyMany | ROX | Read-only on many nodes |
| ReadWriteMany | RWX | Read-write on many nodes. Needs a shared file system such as EFS or NFS. |

## Dynamic provisioning with a PVC

On a managed cluster a default StorageClass usually exists. Check it first:

```bash
kubectl get storageclass
```

```output
NAME            PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      AGE
gp2 (default)   kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer   3d
```

Then ask for storage:

```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: orders-data
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp2        # omit to use the default class
  resources:
    requests:
      storage: 10Gi
```

```yaml
# Use it in a pod or Deployment
spec:
  containers:
    - name: orders
      image: my-registry/orders-service:1.0
      volumeMounts:
        - name: data
          mountPath: /var/lib/orders
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: orders-data
```

```bash
kubectl apply -f pvc.yaml
kubectl get pvc orders-data
```

```output
NAME          STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
orders-data   Bound    pvc-7f3c1a9e-5b2d-4e8f-9a1c-0d2b3e4f5a6b   10Gi       RWO            gp2            12s
```

`STATUS` shows `Pending` until a pod uses the claim when the class uses `WaitForFirstConsumer`. This is so the volume is created in the same availability zone as the pod.

## Databases: use a StatefulSet

A StatefulSet gives each pod its own PVC through `volumeClaimTemplates`. Pod `postgres-0` always gets the same volume back.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres-headless   # the headless Service from the Networking page
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-auth
                  key: password
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: pgdata
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: pgdata
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 20Gi
```

Running a production database on Kubernetes is possible but demanding. On AWS many teams use RDS instead and keep Kubernetes for stateless services. See the AWS section.

## Reclaim policy

| Policy | When the PVC is deleted |
|---|---|
| **Delete** | The underlying volume is deleted too (default for dynamic classes) |
| **Retain** | The volume is kept and must be cleaned up by hand |

For important data, set `reclaimPolicy: Retain` on the StorageClass and back up regularly (for example with Velero or the cloud provider's snapshots).

## Key takeaways

- StorageClass describes the kind of storage, PVC requests it, PV is the result.
- Choose the access mode the storage supports: block storage is usually RWO.
- StatefulSets use `volumeClaimTemplates` to give each replica its own volume.
- Check the reclaim policy before you delete a PVC.
