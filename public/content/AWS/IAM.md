# AWS: IAM (Identity and Access Management)

IAM controls **who** can do **what** on **which** resources. Almost every AWS security incident traces back to an over-permissive IAM policy or a leaked long-lived key, so IAM questions are guaranteed in interviews.

## Core objects

| Object | What it is | Credentials |
|---|---|---|
| **User** | A long-lived identity for a person or legacy system | Password and/or access keys |
| **Group** | A collection of users that share policies | None (users in the group get the policies) |
| **Role** | An identity that is *assumed* temporarily | Temporary credentials from STS |
| **Policy** | A JSON document of allow/deny statements | Attached to users, groups or roles |

Prefer **roles with temporary credentials** over users with access keys. Services (EC2, ECS tasks, Lambda, EKS pods) get roles automatically.

## Anatomy of a policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOrderExports",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::orders-exports-prod",
        "arn:aws:s3:::orders-exports-prod/*"
      ],
      "Condition": {
        "IpAddress": { "aws:SourceIp": "10.0.0.0/16" }
      }
    }
  ]
}
```

| Element | Meaning |
|---|---|
| `Effect` | `Allow` or `Deny` |
| `Action` | API calls, such as `s3:GetObject` |
| `Resource` | ARN(s) the action applies to |
| `Condition` | Optional extra checks: IP, time, tags, MFA |

Note that `ListBucket` applies to the bucket ARN, and `GetObject` applies to the objects (`/*`). This is a common interview gotcha.

**Evaluation rule:** an explicit `Deny` always wins. Otherwise access needs an explicit `Allow`. If nothing matches, the request is denied by default.

## Roles and trust

A role has two policies:
- **Trust policy**: who may assume the role
- **Permissions policy**: what the role may do

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

That trust policy lets ECS tasks assume the role. Cross-account access uses a trust policy that names another account's ARN.

```bash
aws iam create-role --role-name orders-task-role \
  --assume-role-policy-document file://trust.json
aws iam put-role-policy --role-name orders-task-role \
  --policy-name read-exports --policy-document file://policy.json
aws sts assume-role --role-arn arn:aws:iam::123456789012:role/orders-task-role \
  --role-session-name test
```

```output
{
    "Credentials": {
        "AccessKeyId": "ASIA...",
        "SecretAccessKey": "...",
        "SessionToken": "...",
        "Expiration": "2026-10-27T13:00:00+00:00"
    },
    "AssumedRoleUser": { ... }
}
```

## Multi-Factor Authentication (MFA)

MFA adds a second factor (something you have, such as a code from an authenticator app or a hardware key) to a password. It is the cheapest large reduction in account takeover risk.

| MFA type | Notes |
|---|---|
| **Virtual MFA device** | TOTP app such as Authy, 1Password or Google Authenticator; most common |
| **FIDO2 security key** | Hardware key (YubiKey); phishing-resistant; recommended for root and admins |
| **Hardware TOTP token** | Physical token generating codes |

Enable MFA for the root user first, then for every human IAM user and for IAM Identity Center. Root MFA should use a hardware key stored by two trusted people.

```bash
aws iam create-virtual-mfa-device --virtual-mfa-device-name orders-dev-mfa \
  --outfile qr.png --bootstrap-method QRCodePNG
aws iam enable-mfa-device --user-name orders-dev \
  --serial-number arn:aws:iam::123456789012:mfa/orders-dev-mfa \
  --authentication-code1 123456 --authentication-code2 789012
```

Enforce MFA with a policy. This policy denies everything except setting up MFA when the session has not authenticated with MFA:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSelfMfaSetup",
      "Effect": "Allow",
      "Action": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:GetUser",
        "iam:ListMFADevices",
        "iam:ChangePassword"
      ],
      "Resource": "arn:aws:iam::*:user/${aws:username}"
    },
    {
      "Sid": "DenyAllWithoutMfa",
      "Effect": "Deny",
      "NotAction": ["iam:*"],
      "Resource": "*",
      "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
    }
  ]
}
```

Use `aws:MultiFactorAuthPresent` in conditions on sensitive actions, such as deleting data or changing IAM, so those require a recent MFA-authenticated session.

## Least privilege

- Start with no permissions and add what the workload needs.
- Use **IAM Access Analyzer** to find unused permissions and resources shared outside your account.
- Check effective permissions with the **policy simulator** before deploying.
- Replace `"Action": "*"` and `"Resource": "*"` with specific values.

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/orders-task-role \
  --action-names s3:DeleteObject \
  --resource-arns arn:aws:s3:::orders-exports-prod/file.csv \
  --query "EvaluationResults[0].EvalDecision"
```

```output
"implicitDeny"
```

## Credentials hygiene

| Practice | Why |
|---|---|
| Enable MFA on the root user and all humans | Stops password-only compromise |
| Never create root access keys | Root can do anything, so keys are very dangerous |
| Rotate or remove unused access keys | Long-lived keys leak |
| Use IAM Identity Center for people | Short-lived sessions, central control |
| Scan repos for secrets (git-secrets, GitHub secret scanning) | Keys in git are the most common leak |

```bash
# Find access keys that have not been used for 90 days
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text | base64 -d | \
  awk -F, 'NR>1 && $9=="true" {print $1, $9, $10, $11}'
```

## Service control policies (SCPs)

An SCP sets the outer limit for every account in an organization. Even an admin inside the account cannot exceed it.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeavingApprovedRegions",
      "Effect": "Deny",
      "NotAction": ["iam:*", "organizations:*", "sts:*", "support:*"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:RequestedRegion": ["us-east-1", "eu-west-2"] }
      }
    }
  ]
}
```

## IAM for Kubernetes and containers

- **ECS tasks**: a *task role* (what the app can call) and an *execution role* (what ECS needs to pull images and write logs). See the ECS page.
- **EKS pods**: IRSA or EKS Pod Identity link a Kubernetes ServiceAccount to an IAM role. See the EKS page in the Kubernetes section.
- **EC2**: an instance profile wraps a role for the instance. Use IMDSv2 to protect the metadata endpoint.

## Key takeaways

- Users are for people; roles with temporary credentials are for workloads.
- Explicit Deny wins; otherwise an explicit Allow is required.
- Scope `Resource` to specific ARNs. Remember object-level vs bucket-level ARNs.
- Use SCPs for guardrails across accounts and Access Analyzer to trim permissions.
- Never create root access keys, and enable MFA everywhere.
