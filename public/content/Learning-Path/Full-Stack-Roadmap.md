# Full-Stack Learning Path

This wiki covers the full path from writing code to running it in production and watching it. The order below is a suggested sequence: each phase builds on the one before, and each ends with a project you can build and run. Work through a phase, do its project, then move on. Read the interview pages near the end of each phase while the material is fresh.

## How the tabs fit together

| Phase | Tabs | What you can do afterwards |
|---|---|---|
| 1. Language foundations | Java | Write idiomatic Java, use collections, streams, exceptions and concurrency |
| 2. Backend services | Java (Spring Boot, Microservices, Resilience, Testing) | Build and test REST services that talk to each other |
| 3. Data | SQL, Java (Locking and Idempotency) | Model data, write efficient queries, handle concurrent updates |
| 4. Frontend | React, Angular | Build a UI that calls your APIs |
| 5. Containers | Docker | Package each service, run stacks locally, keep logs and data safe |
| 6. Events | Kafka | Connect services asynchronously without losing or duplicating events |
| 7. Orchestration | Kubernetes | Deploy, scale and heal services across a cluster |
| 8. Cloud | AWS | Run on managed infrastructure with secure networking, storage and databases |
| 9. Observability | Kibana, Grafana, Java (Observability) | Find, measure and alert on problems |
| 10. Delivery | AWS (CI/CD, IaC), Kubernetes (Helm, GitOps) | Ship changes safely and reproducibly |
| 11. AI (optional) | AI, AWS (Bedrock and SageMaker) | Add generative AI features with guardrails |

## Phase 1: Language foundations (Java)

Read in this order:

1. Core Concepts, OOP Concepts (including Comparable and Comparator)
2. Collections, Collections Deep Dive, Collectors
3. Streams and Lambdas, Custom Collectors
4. Exception Handling
5. Multithreading (including Threads and blocking I/O)

**Project:** a command-line tool that reads a CSV of orders, sorts and groups them with streams, and writes a report. Add unit tests for the sorting and grouping logic.

<details>
<summary>Show project answer</summary>

1. Read the file with `Files.lines(path).skip(1)` so the header is ignored.
2. Parse each line into a `record Order(String customer, LocalDate date, double total)`. Validate the fields and collect bad lines separately, rather than failing the whole run.
3. Sort with a comparator chain: `Comparator.comparing(Order::customer).thenComparing(Order::date)`.
4. Group totals per customer: `orders.stream().collect(Collectors.groupingBy(Order::customer, TreeMap::new, Collectors.summingDouble(Order::total)))`.
5. Write the report with `PrintWriter`, one line per customer, and write rejected lines to a second file.
6. Tests (JUnit 5): one fixture CSV with a known answer, one test for the sort order with two orders for the same customer on different dates, and one test that a malformed row is rejected without stopping the run.

</details>

**Check yourself:** explain the difference between `Comparable` and `Comparator`; explain why an I/O call blocks a thread; name the `ExecutorService` factory methods.

<details>
<summary>Show answers</summary>

- `Comparable` gives a class one natural order, defined inside the class by `compareTo()`. `Comparator` is an external ordering defined by `compare()`, and a class can have many. Use `Comparable` for the obvious order and `Comparator` for alternatives.
- A blocking I/O call makes the thread wait inside the operating system until data arrives. The thread holds its stack and resources and does no other work in the meantime. Thread pools or virtual threads let other work proceed while it waits.
- `newFixedThreadPool(n)`, `newCachedThreadPool()`, `newSingleThreadExecutor()`, and `newVirtualThreadPerTaskExecutor()` (Java 21+).

</details>

## Phase 2: Backend services (Java)

1. Spring Boot
2. Microservices Architecture, Service Discovery (Eureka)
3. Resilience Patterns
4. Testing
5. DTO, and the Java 17 vs 21 comparison

**Project:** two Spring Boot services, `orders` and `payments`. `orders` calls `payments` over HTTP with a timeout and a circuit breaker. Cover both with unit and integration tests.

<details>
<summary>Show project answer</summary>

1. `payments` exposes `POST /payments` and returns `201` with a payment ID.
2. `orders` calls it through `RestClient` with connect and read timeouts (for example 1 s and 2 s). Never leave the default, which can be unbounded.
3. Wrap the call with Resilience4j `@CircuitBreaker(name = "payments", fallbackMethod = "paymentPending")`. The fallback saves the order as `PAYMENT_PENDING` instead of failing the request.
4. Configure the breaker:
```yaml
resilience4j:
  circuitbreaker:
    instances:
      payments:
        slidingWindowSize: 20
        failureRateThreshold: 50
        waitDurationInOpenState: 10s
        permittedNumberOfCallsInHalfOpenState: 3
```
5. Tests: a unit test that the fallback marks the order `PAYMENT_PENDING`; an integration test with WireMock that delays the response past the timeout, and another that returns `500` 20 times and asserts the breaker opens (later calls fail fast without reaching WireMock).

</details>

**Check yourself:** what happens when `payments` is slow; how a circuit breaker changes that; why integration tests matter for HTTP clients.

<details>
<summary>Show answers</summary>

- Each `orders` request waits on the slow call, holding a server thread. Requests pile up until the thread pool is exhausted, and then `orders` stops answering too. A slow dependency becomes a full outage: a cascading failure.
- After enough failures the breaker opens and calls fail immediately, so threads are freed and the fallback runs. After the wait period it moves to half-open and lets a few calls through to test recovery.
- Mocked clients never serialize JSON, never hit a real timeout, and never see a real `500` or a dropped connection. Integration tests with a real HTTP server (WireMock or MockWebServer) exercise those paths.

</details>

## Phase 3: Data (SQL and transactions)

1. SQL section: queries, joins, indexes, transactions
2. Java: Locking and Idempotency, Locking Quick Reference

**Project:** add a PostgreSQL database to the `orders` service. Write the schema by hand, add an index for the most common query, and make order creation idempotent with a unique key.

<details>
<summary>Show project answer</summary>

```sql
CREATE TABLE orders (
    id               BIGSERIAL PRIMARY KEY,
    customer_id      BIGINT       NOT NULL,
    status           VARCHAR(20)  NOT NULL,
    total            NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    idempotency_key  VARCHAR(64)  NOT NULL UNIQUE,
    version          INTEGER      NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The most common query: a customer's recent orders
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);
```
- Check the index is used: `EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 10;` should show an index scan, not a sequential scan, once the table has enough rows.
- Idempotent insert: `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`. If nothing is returned, select the existing row by its key and return it with `200` instead of `201`.
- Test it: send the same request twice in parallel from a test and assert exactly one row exists.

</details>

**Check yourself:** explain optimistic and pessimistic locking; show how a duplicate request is handled without creating two orders.

<details>
<summary>Show answers</summary>

- Optimistic locking keeps a `version` column. An update runs `UPDATE orders SET ..., version = version + 1 WHERE id = ? AND version = ?`. If zero rows change, someone else changed it first, so the caller retries or reports a conflict. It suits low contention.
- Pessimistic locking takes the row lock up front with `SELECT ... FOR UPDATE`. Other transactions wait until the first commits. It suits high contention on a single row, such as a stock counter, at the cost of waiting.
- A duplicate request carries the same `Idempotency-Key`. The unique constraint means the second insert does nothing, and the service returns the order created by the first request. Only one row exists.

</details>

## Phase 4: Frontend (React or Angular)

Choose one framework to go deep on and skim the other. Both sections cover components, state, calling APIs and testing.

**Project:** a small web page that lists orders from the `orders` API, filters them by status, and shows a detail view. Run it against the API from Phase 2.

<details>
<summary>Show project answer</summary>

1. Fetch the list with `GET /orders?status=PAYMENT_PENDING`. Keep the status filter in the URL so a refresh keeps the view.
2. Show loading and error states for every request. A blank screen on failure is the most common bug in this kind of page.
3. Detail view: `GET /orders/{id}` on route change. Handle `404` by showing "not found", not an error.
4. In development, proxy `/api` to the backend (Vite `server.proxy` or the framework's equivalent) to avoid CORS. If you call it directly, add a CORS policy to `orders` that allows only your frontend origin.
5. Test: one component test for the filter (mock the API), one end-to-end test that opens the list and the detail for a seeded order.

</details>

**Check yourself (Phase 4):** how do you avoid one API call per keystroke in a search box? Where should filtering happen for a large list, and why? What is the risk of storing the auth token in `localStorage`?

<details>
<summary>Show answers</summary>

- Debounce the input (wait about 300 ms after the last keystroke) or submit on Enter. Cancel or ignore responses from earlier requests so an old response cannot overwrite a newer one.
- Filter on the server for large lists. Pagination and filtering in the query keep payloads small, and the database uses its indexes. Client-side filtering is fine only for a few hundred items already loaded.
- Any script running on the page can read `localStorage`, so one XSS bug exposes the token. Prefer an `HttpOnly` cookie set by the server, which scripts cannot read, and keep token lifetimes short.

</details>

## Phase 5: Containers (Docker)

Read in this order:

1. Overview and Core Concepts
2. Dockerfile and Images
3. Volumes and Data Persistence
4. Docker Networking, then Connecting Between Networks
5. Logging and Preserving Logs
6. Data Recovery and Backup
7. Docker Compose
8. Security and Troubleshooting

**Project:** a Compose stack with the frontend, `orders`, `payments`, PostgreSQL and Redis. Use two networks so the database is not reachable from the frontend. Write a backup script for the database volume and run a restore drill: delete the volume, restore from the backup, and confirm the data is back.

<details>
<summary>Show project answer</summary>

```yaml
services:
  frontend: { image: frontend:1.0, networks: [public] }
  orders:   { image: orders:1.0,   networks: [public, backend] }
  payments: { image: payments:1.0, networks: [backend] }
  db:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    networks: [backend]
  cache:    { image: redis:7-alpine, networks: [backend] }
networks:
  public:
  backend:
    internal: true      # db, cache and payments have no route to the internet
volumes:
  pgdata:
```
- Backup script (run nightly, keep 14 copies):
```bash
docker compose exec -T db pg_dump -U app -Fc orders > backups/orders-$(date +%F).dump
find backups -name 'orders-*.dump' -mtime +14 -delete
```
- Restore drill: `docker compose down`, `docker volume rm <project>_pgdata`, `docker compose up -d db`, wait for `pg_isready`, then `docker compose exec -T db pg_restore -U app -d orders < backups/orders-<date>.dump`. Run a row count before the drill and after, and record how long the restore took.

</details>

**Check yourself:** what `docker compose down -v` deletes; why `--rm` makes crash investigation harder; how a container on two networks can reach both.

<details>
<summary>Show answers</summary>

- `docker compose down -v` removes the containers, the networks, and the named volumes. The named volumes hold the database data, so this deletes the data. `docker compose down` keeps the volumes.
- With `--rm` the container is deleted the moment it exits, along with its writable layer and its logs under the default driver. You cannot run `docker inspect` on the exit state or read the logs afterward. Keep the container, or ship logs to a central store.
- The container gets a network interface and an IP address on each network. It resolves service names on both networks, so it can receive traffic from one and send it to the other. That is how the `orders` service bridges the public and backend networks.

</details>

## Phase 6: Events (Kafka)

1. Overview and Core Concepts
2. Topics, Partitions and Replication
3. Producers in Java, Consumers and Consumer Groups
4. Kafka with Spring Boot
5. Reliability and Delivery Semantics
6. Connect, Streams and Schemas
7. Operations and Monitoring

**Project:** `orders` publishes `OrderPlaced` events with the outbox pattern. `billing` and `notifications` consume them in separate consumer groups, handle duplicates by event ID, and send failed events to a dead-letter topic. Stop a consumer mid-batch and confirm no event is lost or processed twice in effect.

<details>
<summary>Show project answer</summary>

1. `orders`: in the same transaction as the order insert, write an `outbox` row (`aggregate_id = orderId`, `topic = orders.placed`, `payload`). A relay (polling or Debezium) publishes unsent rows with `acks=all` and marks them sent.
2. Topic `orders.placed` with 6 partitions, replication factor 3 in production (1 locally), keyed by order ID.
3. `billing` and `notifications` each use their own `group.id`, so each receives every event.
4. Each consumer inserts the event ID into `processed_events` in the same transaction as its side effect. A duplicate hits the primary key and is skipped.
5. Spring Kafka `DefaultErrorHandler` retries with backoff, then publishes to `orders.placed-dlt`.
6. Test: start the consumer, publish 100 events, `docker stop` the consumer after about 40, restart it, then check that `processed_events` has 100 rows per group and no duplicate charges. The DLT should be empty.

</details>

**Check yourself:** explain at-least-once versus exactly-once; explain why a partition key matters; explain the dual-write problem and how the outbox solves it.

<details>
<summary>Show answers</summary>

- At-least-once means no event is lost, but a retry can deliver it again, so consumers must be idempotent. Exactly-once means each event has its effect once. Kafka provides it within Kafka itself using idempotent producers and transactions. Across an external database you achieve the same result with idempotent processing, such as a processed-event table written in the same transaction.
- Records with the same key go to the same partition, and a partition is ordered. Keying by order ID keeps every event for one order in sequence. Without a sensible key, events for one order can be processed out of order, and a poor key creates hot partitions.
- Saving to a database and publishing to Kafka cannot be atomic. One can succeed while the other fails, which loses or invents events. The outbox writes the event into a database table in the same transaction as the business change. A separate relay publishes it later, so the two can no longer disagree.

</details>

## Phase 7: Orchestration (Kubernetes)

1. Overview and Architecture
2. Pods and Deployments
3. Services and Networking, Ingress and TLS
4. ConfigMaps and Secrets, Storage
5. Probes and Resources, Autoscaling
6. Security and RBAC
7. Helm and Kustomize
8. Troubleshooting and kubectl
9. Kubernetes on AWS (EKS)

**Project:** deploy the Phase 5 stack to a local kind cluster. Add readiness and liveness probes, resource requests, a horizontal autoscaler for `orders`, and an Ingress. Break a deployment on purpose (wrong image tag) and fix it with a rollback.

<details>
<summary>Show project answer</summary>

```bash
kind create cluster --name shop
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl apply -f orders-deployment.yaml -f orders-service.yaml -f orders-hpa.yaml -f ingress.yaml
```
- In the Deployment: `readinessProbe` and `livenessProbe` on `/actuator/health/readiness` and `/actuator/health/liveness`, `resources.requests` (for example `250m` CPU, `256Mi` memory), and `limits`.
- HPA on CPU with `minReplicas: 2`, `maxReplicas: 6`, target 70%. Generate load with a busybox loop and watch `kubectl get hpa -w`.
- Break it: `kubectl set image deployment/orders orders=orders:does-not-exist`. The new pod shows `ImagePullBackOff`, and because `maxUnavailable: 0`, the old pods keep serving. Recover with `kubectl rollout undo deployment/orders` and confirm with `kubectl rollout status`.

</details>

**Check yourself:** what each probe does when it fails; why requests matter for scheduling; how a Service finds its pods.

<details>
<summary>Show answers</summary>

- A failing liveness probe makes the kubelet restart the container. A failing readiness probe removes the pod from the Service's endpoints, but leaves it running. A startup probe holds back the other two until a slow app has started. Liveness should check only the process, never a shared dependency.
- The scheduler places a pod only on a node that has enough unreserved CPU and memory for its requests. Requests also set the QoS class, which decides eviction order under memory pressure. Without requests, the scheduler cannot pack nodes sensibly and autoscaling cannot compute utilisation.
- The Service selects pods by label. The control plane keeps an EndpointSlice listing the IPs of ready pods that match, and traffic goes to those addresses. An empty endpoints list means the selector matches no ready pod.

</details>

## Phase 8: Cloud (AWS)

Start with the foundations, then the services you will use most:

1. Cloud Models, Console and Billing, AWS Overview
2. IAM, including MFA, and Auditing (CloudTrail and Config)
3. VPC and Networking
4. Compute (EC2, Auto Scaling, Lambda, Elastic Beanstalk)
5. S3, EBS and EFS
6. ECR and ECS
7. Load Balancing, DNS and CDN
8. Databases (RDS, Aurora, DynamoDB, Redshift)
9. Messaging (SQS, SNS, EventBridge)
10. Monitoring, Secrets and Security Services

**Project:** move the Phase 7 deployment to AWS. Push images to ECR, run `orders` on ECS Fargate behind an ALB in private subnets, store data in RDS, keep secrets in Secrets Manager, and serve the frontend from S3 through CloudFront. Set a monthly budget with alerts before you start.

<details>
<summary>Show project answer</summary>

1. Budget first: create a monthly budget with an 80% actual-spend alert (see the Cloud Models page).
2. Network: VPC with two public and two private subnets across two AZs, an internet gateway for the ALB, and a NAT gateway or VPC endpoints (ECR, S3, Secrets Manager) for private tasks.
3. Images: create an ECR repository with immutable tags and scan-on-push, then push `orders:<git-sha>`.
4. Data: RDS PostgreSQL in database subnets, Multi-AZ off for the learning version, not publicly accessible, with its password managed by Secrets Manager.
5. Compute: ECS cluster, a task definition with `awsvpc` networking, `requiresCompatibilities: FARGATE`, the image from ECR, and a `secrets` entry for the database password. Create a service with two tasks, the private subnets, and the ALB target group (`target-type ip`).
6. Frontend: build the React or Angular app, upload to S3 with the bucket private, and serve it through CloudFront with Origin Access Control. Route `/api/*` to the ALB as a second origin.
7. Teardown checklist after the exercise: delete the ECS service, ALB, NAT gateway, RDS instance (take a final snapshot), and any Elastic IPs.

</details>

**Check yourself:** the difference between the ECS task role and execution role; why a database sits in a private subnet; why you should set a budget before creating resources.

<details>
<summary>Show answers</summary>

- The execution role is used by the ECS agent to pull the image from ECR, write logs to CloudWatch, and read the secret named in the task definition. The task role is what your application code assumes when it calls AWS services, such as S3 or SQS. Keep them separate so the app cannot pull images or read other secrets, and the agent does not need application permissions.
- A private subnet has no route to the internet gateway, so nothing outside the VPC can connect to the database. Only the application's security group is allowed on port 5432. That removes the database from the attack surface.
- Resources bill from the moment they exist, and some bill while idle: NAT gateways, load balancers and databases. A budget with an alert tells you within hours if a forgotten resource is costing money, rather than at the end of the month.

</details>

## Phase 9: Observability (Kibana, Grafana, Java)

1. Java: Observability (ELK, Prometheus, Kibana basics)
2. Kibana: Overview, Data Views, Discover and KQL, Dashboards, Ingesting Logs, Alerting and Security
3. Grafana: Overview, Prometheus and PromQL, Dashboards, Loki and LogQL, Alerting and On-Call
4. Observability and Kibana interview pages

**Project:** instrument `orders` with structured JSON logs and a trace ID, Micrometer metrics, and an OpenTelemetry-compatible trace header. Ship logs to Loki or Elasticsearch, metrics to Prometheus. Build one Grafana dashboard with the headline row, latency percentiles and a logs panel. Create a burn-rate alert, route it to a test contact point, and trigger it with a load test.

<details>
<summary>Show project answer</summary>

1. Logs: a Logback JSON encoder on stdout with `traceId`, `service`, `env` and `version` fields. Copy the trace ID from the incoming `traceparent` header into MDC so every line for a request carries it.
2. Metrics: `micrometer-registry-prometheus`, with `http.server.requests` percentile histograms enabled, and Prometheus scraping `/actuator/prometheus` (see the Prometheus page).
3. Logs shipping: Grafana Alloy or the Loki Docker driver. Confirm with `{service="orders"} | json | traceId != ""` in Explore.
4. Dashboard: a stat row (request rate, error ratio, p95, alerts), a time-series row for latency percentiles, and a logs panel filtered by `$service` and `$env` variables.
5. Burn-rate alert: a 99.9% availability SLO, with the fast-burn rule on 1-hour and 5-minute windows and threshold `14.4 * 0.001`. Set `for: 2m`, label `severity=page`, link a runbook.
6. Trigger it: run `k6` or `hey` against an endpoint that you make fail with a flag (for example, `?chaos=true` that returns `500`). Confirm the alert goes to the test contact point, then remove the flag and confirm it resolves.

</details>

**Check yourself:** why p95 is more useful than an average; why a `for` period reduces noise; how you find one request across services.

<details>
<summary>Show answers</summary>

- An average blends fast and slow requests, so a few very slow requests barely move it. p95 says that 5% of users see something at least that slow, which is the experience that matters for an SLO.
- A `for` period requires the condition to hold continuously for that long before the alert fires. A single bad scrape or a short spike resets the timer and never pages anyone, while a sustained problem still fires.
- Put a trace ID in every log line and propagate it between services. Then search for that ID in Kibana (`traceId : "..."`) or Loki (`{env="prod"} | json | traceId="..."`) and sort by time to see the request's path across services.

</details>

## Phase 10: Delivery (CI/CD, Infrastructure as Code, GitOps)

1. AWS: Infrastructure as Code (CloudFormation, CDK, Terraform)
2. AWS: CI/CD with CodeBuild, CodeDeploy and CodePipeline
3. Kubernetes: Helm and Kustomize

**Project:** define the Phase 8 infrastructure in Terraform or CloudFormation, with remote state for Terraform. Build a pipeline that runs `plan` on pull requests, builds and pushes the image on merge, deploys to staging, waits for approval, and then deploys to production.

<details>
<summary>Show project answer</summary>

1. Layout: modules for `network`, `ecr`, `rds` and `ecs-service`, and one root per environment (`envs/staging`, `envs/prod`) that calls them with different variables.
2. Remote state: S3 bucket with versioning and encryption, plus a DynamoDB lock table (see the backend block on the IaC page). Each environment has its own state key.
3. Pipeline on pull request: `terraform fmt -check`, `terraform validate`, `terraform plan -out=tfplan`, and post the plan output as a PR comment.
4. Pipeline on merge to `main`: build the image once, tag it with the commit SHA, push to ECR, run `terraform apply` for staging with that image tag, run smoke tests.
5. Approval gate: a manual approval stage (CodePipeline manual action or a GitHub environment with required reviewers).
6. Production: the same image digest, `terraform apply` for `envs/prod`, then a health check and an automatic rollback (the ECS deployment circuit breaker) if it fails.
7. Auth: use OIDC from the CI provider to assume a deploy role, with no stored access keys.

</details>

**Check yourself:** why you build an image once and promote it; what a Terraform plan replacement line means for a database.

<details>
<summary>Show answers</summary>

- The image you tested in staging is the exact artifact you release to production. Rebuilding for production can pull in a different base image or dependency version, so you would release something nobody tested. Promote by tag or digest instead.
- A line starting with `-/+` means Terraform will destroy the resource and create it again. For a database that means losing its data unless you have a snapshot and the change is planned for it. Check every replacement before applying, use `prevent_destroy` on stateful resources, and take a snapshot first.

</details>

## Phase 11: AI (optional)

1. AI section: RAG, Embeddings and Vector Databases, Prompt Engineering, Function Calling, LLM Evaluation, AI Security and Prompt Injection
2. AWS: Generative AI (Bedrock and SageMaker)

**Project:** add a question-answering endpoint to `orders` that answers from your order-policy documents using retrieval, cites its sources, and refuses questions outside the documents. Evaluate it on twenty test questions before you ship it.

<details>
<summary>Show project answer</summary>

1. Ingest: split the policy documents into chunks of about 500 tokens with a small overlap, embed them, and store the vectors (pgvector in the existing PostgreSQL, or a Bedrock Knowledge Base backed by OpenSearch Serverless).
2. Retrieve: embed the question, fetch the top 4 chunks by similarity, and keep the chunk source and section for citations.
3. Answer: send the question and chunks to the model with a system prompt that says to answer only from the provided context, to cite sources as `[doc#section]`, and to reply "I don't know" when the context does not answer the question.
4. Refuse out-of-scope questions: if the best similarity score is below a threshold, return the refusal without calling the model. Add a Bedrock Guardrail (or an equivalent content filter) for the output.
5. Evaluate: write 20 questions in a file with the expected source for each, and 5 out-of-scope questions that must be refused. Measure retrieval hit rate (expected source in the top 4), answer correctness (reviewed by hand or by a judge model), and refusal rate on out-of-scope questions.
6. Log the question, retrieved source IDs, token counts and latency for each call, without storing personal data.

</details>

**Phase 11 check (optional):** what makes an answer grounded? Why evaluate retrieval separately from generation? Why is a refusal a feature here?

<details>
<summary>Show answers</summary>

- A grounded answer uses only retrieved text and cites where each claim came from. You can check it against the source, so a wrong answer is visible rather than plausible-sounding.
- If the answer is wrong, you need to know whether retrieval missed the right chunk or the model ignored it. Measuring retrieval (hit rate in the top 4) separately tells you which part to fix.
- For policy questions, a confident wrong answer is worse than no answer. Refusing out-of-scope questions keeps the system within what the documents support.

</details>

## Interview preparation

Each tab ends with an interview page. A reasonable order to use them:

1. Java Interview Questions, Collections and Streams
2. Docker Interview Questions
3. Kubernetes Interview Questions
4. Kafka Interview Questions
5. AWS Interview Questions
6. Kibana and Observability interview pages
7. Microservices Interview Prep

For system design questions, combine them: design an order pipeline with a Spring service, Kafka events, a Postgres outbox, Kubernetes deployment on EKS, and Grafana alerts on the SLO.

## Weekly rhythm

| Days | Activity |
|---|---|
| Two sessions | Read one or two pages and type out the examples yourself |
| One session | Build the phase project, however small |
| One session | Answer five interview questions aloud, then check the answers |
| Once a week | Break something on purpose in your lab and recover it |

Roughly one phase per two to three weeks at part-time pace gives a full-stack foundation in about eight months. Phases 1 to 4 are the core for most full-stack roles; phases 5 to 10 turn a developer into someone who can run what they build.

## Completion checklist

- [ ] Phase 1: Java foundations project committed to git with tests
- [ ] Phase 2: `orders` and `payments` services with integration tests
- [ ] Phase 3: PostgreSQL schema, index, idempotent order creation
- [ ] Phase 4: Frontend calling the API
- [ ] Phase 5: Compose stack with two networks and a restore drill completed
- [ ] Phase 6: Events flowing through Kafka with the outbox and dead-letter topic
- [ ] Phase 7: Deployment on kind with probes, autoscaling and a rollback exercise
- [ ] Phase 8: Same system on AWS with budget alerts set first
- [ ] Phase 9: Dashboard, logs, traces and a burn-rate alert tested by load
- [ ] Phase 10: Infrastructure as code and a promotion pipeline with approval
- [ ] Phase 11 (optional): Retrieval-based answers with an evaluation set

## Key takeaways

- Work in order: language, services, data, frontend, containers, events, orchestration, cloud, observability, delivery.
- Each phase ends with a project you run, not only a page you read.
- Break and recover things on purpose; that is where operational skill comes from.
- Use the interview pages as checkpoints, not as the goal.
