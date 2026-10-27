# AWS: ECR (Elastic Container Registry)

**Amazon ECR** is a private Docker and OCI image registry. It stores your container images close to where they run (ECS, EKS, Lambda, EC2), encrypts them, scans them for vulnerabilities, and controls access through IAM. Public images are also available through ECR Public.

## Concepts

| Term | Meaning |
|---|---|
| **Registry** | One per account per region, e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com` |
| **Repository** | A named collection of images, e.g. `orders-service` |
| **Image** | Identified by digest (`sha256:...`) and optionally one or more tags |
| **Tag** | A human name pointing to an image; mutable unless you set immutability |
| **Lifecycle policy** | Rules that expire old or untagged images |
| **Replication** | Copies images to other regions or accounts |

## Create a repository

```bash
aws ecr create-repository \
  --repository-name orders-service \
  --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=KMS
```

```output
{
    "repository": {
        "repositoryArn": "arn:aws:ecr:us-east-1:123456789012:repository/orders-service",
        "repositoryUri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service",
        "imageTagMutability": "IMMUTABLE",
        "imageScanningConfiguration": { "scanOnPush": true }
    }
}
```

**Immutable tags** stop someone overwriting `1.0` with different code. Every release gets a new tag, usually the git SHA or a version.

## Build, tag, push

```bash
REGISTRY=123456789012.dkr.ecr.us-east-1.amazonaws.com
TAG=$(git rev-parse --short HEAD)

# 1. Log Docker in to ECR (token valid for 12 hours)
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $REGISTRY

# 2. Build and tag
docker build -t orders-service:$TAG .
docker tag orders-service:$TAG $REGISTRY/orders-service:$TAG

# 3. Push
docker push $REGISTRY/orders-service:$TAG
```

```output
The push refers to repository [123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service]
a1b2c3d4e5f6: Pushed
9f8e7d6c5b4a: Layer already exists
3c2b1a0f9e8d: Pushed
a7c9d8e1f2b3: digest: sha256:4f1e... size: 1573
```

Check the scan result after the push:

```bash
aws ecr describe-image-scan-findings \
  --repository-name orders-service \
  --image-id imageTag=$TAG \
  --query "imageScanFindings.findingSeverityCounts"
```

```output
{
    "HIGH": 2,
    "MEDIUM": 7
}
```

## Lifecycle policy

Keep the last 20 tagged images and remove untagged images after 7 days:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Remove untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Keep only the 20 most recent images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    }
  ]
}
```

```bash
aws ecr put-lifecycle-policy --repository-name orders-service \
  --lifecycle-policy-text file://lifecycle-policy.json
```

Lifecycle rules are evaluated in `rulePriority` order, lowest number first.

## Repository policy: cross-account pulls

A repository policy lets another account (for example a shared-services account or a different environment) pull images:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPullFromProd",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::210987654321:root" },
      "Action": [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability"
      ]
    }
  ]
}
```

```bash
aws ecr set-repository-policy --repository-name orders-service \
  --policy-text file://repo-policy.json
```

## Pull requirements

Whoever pulls needs `ecr:GetAuthorizationToken` plus the pull actions. The execution role for ECS tasks already includes them through `AmazonECSTaskExecutionRolePolicy`. EKS nodes need `AmazonEC2ContainerRegistryReadOnly`.

If a pull fails with `no basic auth credentials` or `not authorized to perform ecr:BatchGetImage`, check the login step first, then the IAM role.

## Replication and pull-through cache

- **Cross-region replication** copies images to another region for faster pulls and disaster recovery.
- **Pull-through cache** caches images from public registries such as Docker Hub or Quay in your ECR. This avoids Docker Hub rate limits and keeps images inside your account boundary.

```bash
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix docker-hub \
  --upstream-registry-url registry-1.docker.io
```

## Image security practices

- Keep **scan on push** on, and fail the CI pipeline on critical findings.
- Use minimal base images (distroless, Alpine) to shrink the attack surface.
- Pin base images by digest in production Dockerfiles.
- Sign images with AWS Signer or cosign and verify them at deploy time.

## Key takeaways

- ECR is a regional private registry; access is controlled by IAM and repository policies.
- Use immutable tags and tag each release with a version or git SHA.
- Enable scan on push and act on the findings.
- Lifecycle policies stop storage costs growing without limit.
- Pulls need `GetAuthorizationToken` and the BatchGetImage family of actions.
