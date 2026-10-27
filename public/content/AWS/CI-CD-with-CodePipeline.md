# AWS: CI/CD with CodeBuild, CodeDeploy and CodePipeline

Continuous integration (CI) builds and tests every change. Continuous delivery (CD) releases a tested build to environments automatically or with an approval. AWS's developer tools cover those steps, and they plug into the rest of AWS through IAM, ECR, ECS, S3 and CloudFormation.

| Service | Role | Analogy |
|---|---|---|
| **CodeCommit** | Managed Git repository | GitHub or GitLab |
| **CodeBuild** | Managed build servers that run your build commands | Jenkins agent or GitHub Actions runner |
| **CodeDeploy** | Deploys to EC2, on-premises servers, Lambda or ECS, with rollback | Deployment agent |
| **CodePipeline** | Orchestrates stages: source, build, test, deploy, approval | Jenkins pipeline or GitHub Actions workflow |
| **CodeArtifact** | Managed package repository (Maven, npm, PyPI) | Nexus or Artifactory |

> **Note on CodeCommit:** AWS stopped offering CodeCommit to new customers in 2024. Existing repositories still work, but for new projects use GitHub, GitLab or Bitbucket. CodePipeline connects to them through **AWS CodeConnections** (formerly CodeStar connections). The rest of this page applies whichever Git host you use.

## Pipeline overview

```
Source (GitHub via CodeConnections)
   │  push to main
   ▼
Build (CodeBuild)  → run tests, build image, push to ECR
   │
   ▼
Deploy to staging (CodeDeploy or ECS)
   │
   ▼
Manual approval (SNS notification to approvers)
   │
   ▼
Deploy to production
```

## CodeBuild

CodeBuild runs the commands in a `buildspec.yml` file at the root of your repository, inside a fresh container. Each build starts clean, so builds are reproducible.

```yaml
# buildspec.yml
version: 0.2

env:
  variables:
    IMAGE_REPO: 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service
  parameter-store:
    SONAR_TOKEN: /ci/sonar-token

phases:
  install:
    runtime-versions:
      java: corretto21
  pre_build:
    commands:
      - echo "Logging in to ECR"
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $IMAGE_REPO
      - IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-7)
  build:
    commands:
      - ./mvnw -B verify
      - docker build -t $IMAGE_REPO:$IMAGE_TAG .
  post_build:
    commands:
      - docker push $IMAGE_REPO:$IMAGE_TAG
      - printf '[{"name":"orders","imageUri":"%s"}]' "$IMAGE_REPO:$IMAGE_TAG" > imagedefinitions.json

reports:
  junit-reports:
    files:
      - "target/surefire-reports/*.xml"
    file-format: JUNITXML

artifacts:
  files:
    - imagedefinitions.json

cache:
  paths:
    - "/root/.m2/**/*"
```

Key points:

- **`parameter-store` and `secrets-manager`** inject secrets without writing them into the file.
- **`reports`** publish test results into the CodeBuild console.
- **`cache`** keeps dependencies between builds, which speeds up later runs.
- **`imagedefinitions.json`** tells CodePipeline's ECS deploy action which image to roll out.

```bash
aws codebuild create-project --name orders-build \
  --source type=CODEPIPELINE \
  --artifacts type=CODEPIPELINE \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/amazonlinux-x86_64-standard:5.0,computeType=BUILD_GENERAL1_SMALL,privilegedMode=true \
  --service-role arn:aws:iam::123456789012:role/codebuild-orders-role

aws codebuild start-build --project-name orders-build
aws codebuild batch-get-builds --ids orders-build:6f1c2a9e --query "builds[0].buildStatus"
```

```output
"SUCCEEDED"
```

`privilegedMode=true` is needed to run Docker inside CodeBuild. The build role should allow ECR push and read only the secrets it needs.

## CodeDeploy

CodeDeploy deploys application revisions to compute targets with controlled rollout, health checks and automatic rollback. It supports three compute platforms:

| Platform | Deployment types | Configuration file |
|---|---|---|
| **EC2 / on-premises** | In-place or blue/green | `appspec.yml` with lifecycle hooks |
| **ECS** | Blue/green with traffic shifting | `appspec.yaml` naming the task definition |
| **Lambda** | Traffic shifting between versions (canary, linear, all-at-once) | `appspec.yaml` naming the function version |

### EC2 example: `appspec.yml`

```yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /opt/orders
hooks:
  ApplicationStop:
    - location: scripts/stop.sh
      timeout: 60
  AfterInstall:
    - location: scripts/install.sh
      timeout: 120
  ApplicationStart:
    - location: scripts/start.sh
      timeout: 60
  ValidateService:
    - location: scripts/healthcheck.sh
      timeout: 120
```

```bash
aws deploy create-deployment \
  --application-name orders \
  --deployment-group-name prod-asg \
  --revision revisionType=S3,s3Location={bucket=orders-artifacts,key=orders-1.4.2.zip,bundleType=zip} \
  --deployment-config-name CodeDeployDefault.OneAtATime

aws deploy get-deployment --deployment-id d-ABC123XYZ --query "deploymentInfo.status"
```

```output
"Succeeded"
```

A failed `ValidateService` hook marks the deployment failed, and CodeDeploy can roll back to the last good revision if you enable automatic rollback on failure.

### Lambda example: canary traffic shifting

```yaml
# appspec.yaml
version: 0.0
Resources:
  - OrdersFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: get-order
        Alias: live
        CurrentVersion: "7"
        TargetVersion: "8"
Hooks:
  - BeforeAllowTraffic: validate-before-shift
  - AfterAllowTraffic: validate-after-shift
```

Deployment configurations such as `CodeDeployDefault.LambdaCanary10Percent5Minutes` send 10% of traffic to the new version, wait five minutes, and then shift the rest if CloudWatch alarms stay quiet.

## CodePipeline

CodePipeline connects the stages. Each stage has actions, and the output of one action becomes the input of the next.

### Define a pipeline with CloudFormation

```yaml
Resources:
  OrdersPipeline:
    Type: AWS::CodePipeline::Pipeline
    Properties:
      Name: orders-pipeline
      RoleArn: !GetAtt PipelineRole.Arn
      ArtifactStore:
        Type: S3
        Location: !Ref ArtifactBucket
      Stages:
        - Name: Source
          Actions:
            - Name: GitHub
              ActionTypeId: { Category: Source, Owner: AWS, Provider: CodeStarSourceConnection, Version: "1" }
              Configuration:
                ConnectionArn: arn:aws:codeconnections:us-east-1:123456789012:connection/abcd-1234
                FullRepositoryId: acme/orders-service
                BranchName: main
              OutputArtifacts: [ { Name: Source } ]
        - Name: Build
          Actions:
            - Name: Build
              ActionTypeId: { Category: Build, Owner: AWS, Provider: CodeBuild, Version: "1" }
              Configuration: { ProjectName: orders-build }
              InputArtifacts: [ { Name: Source } ]
              OutputArtifacts: [ { Name: BuildOutput } ]
        - Name: Staging
          Actions:
            - Name: DeployStaging
              ActionTypeId: { Category: Deploy, Owner: AWS, Provider: ECS, Version: "1" }
              Configuration:
                ClusterName: staging
                ServiceName: orders
                FileName: imagedefinitions.json
              InputArtifacts: [ { Name: BuildOutput } ]
        - Name: Approval
          Actions:
            - Name: ManualApproval
              ActionTypeId: { Category: Approval, Owner: AWS, Provider: Manual, Version: "1" }
              Configuration:
                NotificationArn: arn:aws:sns:us-east-1:123456789012:release-approvals
        - Name: Production
          Actions:
            - Name: DeployProduction
              ActionTypeId: { Category: Deploy, Owner: AWS, Provider: ECS, Version: "1" }
              Configuration:
                ClusterName: prod
                ServiceName: orders
                FileName: imagedefinitions.json
              InputArtifacts: [ { Name: BuildOutput } ]
```

```bash
aws cloudformation deploy --template-file pipeline.yaml --stack-name orders-pipeline \
  --capabilities CAPABILITY_NAMED_IAM
aws codepipeline get-pipeline-state --name orders-pipeline \
  --query "stageStates[].[stageName,latestExecution.status]" --output table
```

```output
---------------------------
|   GetPipelineState      |
+-----------+-------------+
|  Source   |  Succeeded  |
|  Build    |  Succeeded  |
|  Staging  |  Succeeded  |
|  Approval |  InProgress |
+-----------+-------------+
```

## Good pipeline practice

| Practice | Why |
|---|---|
| Build once, promote the same artifact | The image tested in staging is the one released to production |
| Tag images with the commit SHA | Traceability from production back to code |
| Use OIDC or pipeline roles, not long-lived keys | No access keys in pipeline variables |
| Put tests before any deploy | Failures stop the pipeline early |
| Require approval for production | A human decides when to release |
| Automate rollback with alarms | CodeDeploy stops a rollout when CloudWatch alarms fire |
| Keep pipeline definitions in version control | Pipelines are infrastructure too |

## Alternatives you will meet

| Tool | Notes |
|---|---|
| **GitHub Actions** | Very common; can deploy to AWS with OIDC |
| **GitLab CI** | Integrated with GitLab repositories |
| **Jenkins** | Self-managed; flexible; higher operating cost |
| **Argo CD / Flux** | GitOps for Kubernetes (see the Kubernetes section) |

## Key takeaways

- CodeBuild runs the build from `buildspec.yml`; CodeDeploy rolls out with health checks and rollback; CodePipeline sequences the stages.
- Build once and promote the same artifact through environments.
- Use CodeConnections for GitHub or GitLab; CodeCommit is no longer open to new customers.
- Gate production with a manual approval and let alarms stop bad rollouts.
