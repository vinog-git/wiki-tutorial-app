# AWS: Generative AI and Machine Learning (Bedrock and SageMaker)

AWS offers two main routes to AI:

| Service | What it is | You choose | You manage |
|---|---|---|---|
| **Amazon Bedrock** | Managed API to foundation models from several providers | A model and how to use it (prompts, knowledge bases, agents) | Your prompts, data and application logic |
| **Amazon SageMaker** | Platform for building, training and hosting your own ML models | Algorithm or framework, data, instance types | Training code, data pipelines, endpoints and monitoring |

Rule of thumb: **use Bedrock to add generative AI to an application quickly; use SageMaker when you need to train or fine-tune your own models, or run custom ML at scale.**

## Amazon Bedrock

Bedrock gives API access to foundation models (large language models, image models, embedding models) from providers such as Anthropic, Meta, Mistral, Amazon and others. You do not manage GPUs or model hosting. The model providers available depend on your region and account, and you must request access to each model in the Bedrock console before first use.

### Core capabilities

| Capability | What it does |
|---|---|
| **Model invocation** | Send a prompt, receive a completion, via `InvokeModel` or the unified `Converse` API |
| **Knowledge Bases** | Retrieval-augmented generation (RAG): index your documents in a vector store and answer questions grounded in them |
| **Agents** | Let a model call your APIs or Lambda functions to complete multi-step tasks |
| **Guardrails** | Block harmful content, deny topics, mask personal data, and check grounding |
| **Model evaluation** | Compare models or prompts on your own test data |
| **Fine-tuning and continued pre-training** | Customise a supported model with your data |
| **Provisioned throughput** | Reserve capacity for predictable latency and volume |

### Invoke a model with the Converse API

The `converse` call works the same across supported models, so you can switch models without rewriting the code:

```python
import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

MODEL_ID = "<a-model-id-enabled-in-your-account>"   # list with: aws bedrock list-foundation-models

response = bedrock.converse(
    modelId=MODEL_ID,
    system=[{"text": "You are a concise assistant for an order-support team."}],
    messages=[{
        "role": "user",
        "content": [{"text": "Summarise why an order might be stuck in PAYMENT_PENDING."}],
    }],
    inferenceConfig={"maxTokens": 300, "temperature": 0.2},
)

print(response["output"]["message"]["content"][0]["text"])
print("input tokens:", response["usage"]["inputTokens"],
      "output tokens:", response["usage"]["outputTokens"])
```

```output
An order stays in PAYMENT_PENDING when the payment provider has not confirmed the charge...
input tokens: 58 output tokens: 112
```

Charges are per input and output token for on-demand use, and tokens are the unit to watch when estimating cost.

### List models and check access

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query "modelSummaries[].[modelId,providerName]" --output table
aws bedrock get-foundation-model-availability --model-id <model-id> --region us-east-1
```

### Retrieval-augmented generation with Knowledge Bases

RAG keeps the model's answers tied to your own content. The pattern:

```
1. Ingest:  S3 documents → chunk → embed (embedding model) → vector store
2. Query:   user question → embed → nearest chunks from the vector store
3. Answer:  question + retrieved chunks → model → answer with citations
```

Knowledge Bases manages steps 1 and 2 for you, with OpenSearch Serverless, Aurora PostgreSQL with pgvector, or another supported store:

```python
agent_runtime = boto3.client("bedrock-agent-runtime", region_name="us-east-1")

resp = agent_runtime.retrieve_and_generate(
    input={"text": "What is our refund window for annual plans?"},
    retrieveAndGenerateConfiguration={
        "type": "KNOWLEDGE_BASE",
        "knowledgeBaseConfiguration": {
            "knowledgeBaseId": "KBID1234",
            "modelArn": "arn:aws:bedrock:us-east-1::foundation-model/<model-id>",
        },
    },
)
print(resp["output"]["text"])
for citation in resp.get("citations", []):
    print("source:", citation["retrievedReferences"][0]["location"])
```

### Guardrails

Attach a guardrail to a model call so the same policy applies everywhere:

```python
response = bedrock.converse(
    modelId=MODEL_ID,
    messages=[{"role": "user", "content": [{"text": user_input}]}],
    guardrailConfig={
        "guardrailIdentifier": "gr-abc123",
        "guardrailVersion": "1",
        "trace": "enabled",
    },
)
if response.get("stopReason") == "guardrail_intervened":
    print("Request blocked by policy")
```

### Security and data handling

| Concern | Bedrock behaviour |
|---|---|
| Your prompts and outputs | Not used to train the foundation models provided by AWS |
| Encryption | Encrypted in transit; you can use a customer managed KMS key for knowledge base and custom model data |
| Network | Use VPC interface endpoints (PrivateLink) so traffic stays inside your VPC |
| Access control | IAM policies on `bedrock:InvokeModel` and specific model ARNs |
| Audit | CloudTrail records invocations; enable model invocation logging to S3 or CloudWatch for prompt-level audit (with care about storing personal data) |

Restrict model access with IAM so only approved models can be called:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel", "bedrock:Converse"],
    "Resource": "arn:aws:bedrock:us-east-1::foundation-model/<approved-model-id>"
  }]
}
```

## Amazon SageMaker

SageMaker is a platform for the full machine learning lifecycle: prepare data, build and train models, deploy them, and monitor them in production.

### Components

| Component | Purpose |
|---|---|
| **SageMaker Studio** | Web IDE for notebooks, experiments and pipelines |
| **Notebook instances / Studio notebooks** | Interactive development |
| **Processing jobs** | Run data preparation at scale |
| **Training jobs** | Train on managed GPU or CPU instances, with spot training to save cost |
| **Model registry** | Versioned models with approval status |
| **Endpoints** | Real-time inference (managed hosting, autoscaling) |
| **Batch transform** | Inference over large datasets without a persistent endpoint |
| **Serverless inference** | Endpoints that scale to zero for intermittent traffic |
| **Pipelines** | Repeatable workflows from data to deployment |
| **Model Monitor** | Detects data drift and quality issues in production |
| **JumpStart** | Pre-built models and solutions you can deploy or fine-tune |
| **Ground Truth** | Labelling workforce and tooling |

### Train and deploy with the Python SDK

```python
import sagemaker
from sagemaker.sklearn.estimator import SKLearn

session = sagemaker.Session()
role = "arn:aws:iam::123456789012:role/SageMakerExecutionRole"

estimator = SKLearn(
    entry_point="train.py",          # your training script
    framework_version="1.2-1",
    instance_type="ml.m5.large",
    instance_count=1,
    role=role,
    sagemaker_session=session,
    hyperparameters={"n-estimators": 200},
)

estimator.fit({"train": "s3://ml-data-prod/churn/train/"})

predictor = estimator.deploy(
    initial_instance_count=1,
    instance_type="ml.m5.large",
)
print(predictor.predict([[0.4, 12, 1, 0.9]]))
```

When you finish, delete the endpoint. Endpoints bill per hour even when idle:

```python
predictor.delete_endpoint()
```

### Cost controls

| Control | Effect |
|---|---|
| Managed spot training | Up to large savings on training; checkpoint to S3 so interrupted jobs resume |
| Serverless inference or autoscaling | Match capacity to traffic |
| Batch transform instead of a live endpoint | For offline scoring |
| Stop Studio apps and notebooks | Idle instances bill |
| Savings Plans for SageMaker | Commitment discount for steady use |

## Bedrock or SageMaker?

| Need | Choose |
|---|---|
| Add a chatbot, summariser or extraction feature to an app | Bedrock |
| Answer questions over company documents | Bedrock Knowledge Bases |
| Let a model call internal APIs to complete tasks | Bedrock Agents |
| Predict churn, detect fraud, forecast demand from your tabular data | SageMaker |
| Fine-tune your own model architecture or train from scratch | SageMaker |
| Full control over model serving infrastructure | SageMaker endpoints |
| Compare several foundation models with the same prompts | Bedrock (model evaluation) |

## Responsible use checklist

- Ground answers in your data with RAG and cite sources.
- Apply guardrails and test them against adversarial prompts.
- Keep personal data out of prompts unless you have a legal basis and controls.
- Evaluate quality on your own test set, not only on public benchmarks.
- Log model usage and review cost per request, especially for long contexts.
- Plan for model version changes: pin the model ID and test before upgrading.

## Key takeaways

- Bedrock is a managed API to foundation models; use the Converse API and add Knowledge Bases, Agents and Guardrails as needed.
- SageMaker is for building and hosting your own ML models across the lifecycle.
- Request model access in Bedrock first, and restrict it with IAM.
- Delete SageMaker endpoints and stop notebooks when you finish; they bill while idle.
