# AWS: Block and File Storage (EBS and EFS)

Storage on AWS comes in three shapes. Choosing the right one is a common interview question.

| Shape | Service | Accessed as | Scope | Typical use |
|---|---|---|---|---|
| **Object** | S3 | HTTP API, keys in buckets | Regional, shared by anything with permission | Backups, media, data lakes, static sites |
| **Block** | EBS | Raw disk attached to one instance | One AZ, usually one instance | Boot volumes, databases on EC2 |
| **File** | EFS | NFS mount, shared directory tree | Regional, many instances and containers | Shared content, CMS uploads, home directories |

## Amazon EBS (Elastic Block Store)

EBS provides block volumes that attach to an EC2 instance, behave like a physical disk, and persist independently of the instance's lifetime.

### Key facts

| Concept | Detail |
|---|---|
| **Availability Zone** | A volume lives in one AZ and can only attach to instances in that AZ |
| **Attachment** | Usually one instance at a time (Multi-Attach exists for specific io1/io2 cases) |
| **Persistence** | Survives instance stop and termination if *DeleteOnTermination* is false for that volume |
| **Snapshots** | Incremental backups to S3; can be copied across regions and used to create new volumes |
| **Encryption** | Enable by default in account settings with a KMS key |

### Volume types

| Type | Category | Use for |
|---|---|---|
| **gp3** | General purpose SSD | Default choice; baseline performance set independently of size |
| **gp2** | General purpose SSD (older) | Performance tied to size; prefer gp3 |
| **io2 Block Express** | Provisioned IOPS SSD | Latency-sensitive, high-IOPS databases |
| **st1** | Throughput optimised HDD | Big sequential workloads: logs, data warehouses |
| **sc1** | Cold HDD | Infrequently accessed data at the lowest cost |

### Create, attach, format and snapshot

```bash
# Create a 100 GiB gp3 volume in the same AZ as the instance
VOL=$(aws ec2 create-volume --availability-zone us-east-1a --size 100 --volume-type gp3 \
  --encrypted --query VolumeId --output text)

aws ec2 attach-volume --volume-id $VOL --instance-id i-0123456789abcdef0 --device /dev/sdf
aws ec2 wait volume-in-use --volume-ids $VOL
```

On the instance:

```bash
lsblk
sudo mkfs -t xfs /dev/nvme1n1           # device name varies on Nitro instances; check lsblk
sudo mkdir -p /data
sudo mount /dev/nvme1n1 /data
echo "UUID=$(sudo blkid -s UUID -o value /dev/nvme1n1) /data xfs defaults,nofail 0 2" | sudo tee -a /etc/fstab
df -h /data
```

```output
Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme1n1     98G   61M   98G   1% /data
```

Snapshot for backup:

```bash
aws ec2 create-snapshot --volume-id $VOL --description "orders-data daily"
aws ec2 describe-snapshots --owner-ids self --query "Snapshots[].[SnapshotId,State,StartTime]" --output table
```

Use **Amazon Data Lifecycle Manager** to create and expire snapshots on a schedule, instead of scripting it.

### Unattached volumes cost money

A volume that is not attached still bills for its size. Find them:

```bash
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query "Volumes[].[VolumeId,Size,AvailabilityZone]" --output table
```

## Amazon EFS (Elastic File System)

EFS is a managed NFS file system. Many instances, containers and Lambda functions can mount the same file system at once, across AZs.

### Key facts

| Concept | Detail |
|---|---|
| **Protocol** | NFSv4.1 and 4.2 |
| **Scope** | Regional; mount targets in each AZ |
| **Sharing** | Thousands of clients can mount the same file system concurrently |
| **Sizing** | Elastic; you pay for stored data, not provisioned size |
| **Storage classes** | Standard, Infrequent Access (IA), Archive; lifecycle policies move cold files |
| **Throughput modes** | Elastic (default), Provisioned, Bursting |

### Create and mount

```bash
FS=$(aws efs create-file-system --performance-mode generalPurpose --throughput-mode elastic \
  --encrypted --tags Key=Name,Value=shared-uploads --query FileSystemId --output text)

aws efs create-mount-target --file-system-id $FS \
  --subnet-id subnet-0ddd3333eee44444f --security-groups sg-0efs0000000000c
```

On the instance (Amazon Linux or Ubuntu with the EFS mount helper):

```bash
sudo mkdir -p /mnt/shared
sudo mount -t efs -o tls $FS:/ /mnt/shared
df -h /mnt/shared
```

Add to `/etc/fstab` for persistence: `fs-0123456789abcdef0:/ /mnt/shared efs _netdev,tls 0 0`.

The security group on the mount target must allow NFS (TCP 2049) from the client's security group.

### Lifecycle management

```bash
aws efs put-lifecycle-configuration --file-system-id $FS \
  --lifecycle-policies TransitionToIA=AFTER_30_DAYS,TransitionToArchive=AFTER_90_DAYS
```

### EFS for containers

ECS tasks and EKS pods can mount EFS as a volume, which is how multiple containers share files:

```json
"volumes": [
  {
    "name": "shared",
    "efsVolumeConfiguration": {
      "fileSystemId": "fs-0123456789abcdef0",
      "transitEncryption": "ENABLED",
      "authorizationConfig": { "iam": "ENABLED" }
    }
  }
]
```

On Kubernetes, use the EFS CSI driver with a `ReadWriteMany` PersistentVolumeClaim (see the Kubernetes section).

## Choosing the right storage

| Requirement | Choose |
|---|---|
| Boot disk for an EC2 instance | EBS (gp3) |
| Database files on a single EC2 host | EBS (io2 for high IOPS) |
| Many servers reading and writing the same files | EFS |
| Backups, logs, data lake, static assets | S3 |
| Container image storage | ECR (not EBS or EFS) |
| Temporary scratch space for a container | Ephemeral storage, or EFS if it must persist |

## Backup and recovery

| Storage | Mechanism |
|---|---|
| EBS | Snapshots (incremental, to S3); DLM for schedules |
| EFS | AWS Backup, or EFS-to-EFS replication |
| S3 | Versioning, cross-region replication, Object Lock |
| All | AWS Backup for one policy across services |

Test restores. A snapshot you have never restored from is not proven.

## Key takeaways

- EBS is a disk for one instance in one AZ; EFS is a shared file system across AZs; S3 is object storage over HTTP.
- Use gp3 by default and encrypt volumes.
- Snapshot EBS, back up EFS with AWS Backup, and version S3 buckets.
- Clean up unattached volumes; they bill while idle.
