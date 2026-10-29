# AWS: Databases (RDS, Aurora, DynamoDB)

Choosing a database is mostly choosing a data model and a failure model. AWS offers managed relational databases (RDS, Aurora), a managed NoSQL key-value and document store (DynamoDB), caches (ElastiCache), and specialised stores.

| Need | Service |
|---|---|
| Relational SQL, existing app on MySQL/PostgreSQL/Oracle/SQL Server | **RDS** |
| High-performance relational, high availability, cloud-native | **Aurora** |
| Key-value or document, single-digit millisecond latency at any scale | **DynamoDB** |
| Caching, session store, leaderboards | **ElastiCache** (Redis or Valkey, Memcached) |
| Analytics over huge datasets | **Redshift** or **Athena** over S3 |
| Graph, time series, ledger | Neptune, Timestream, QLDB (niche) |

## RDS and Aurora

RDS runs the database engine for you: provisioning, patching, backups and failover. You still design schemas, indexes and queries.

### Availability and scaling options

| Feature | Purpose | Notes |
|---|---|---|
| **Multi-AZ deployment** | High availability | A synchronous standby in another AZ. Failover is automatic. The standby **cannot** serve reads. |
| **Read replica** | Scale read traffic, reporting | Asynchronous copy; can lag. Can be in another region. |
| **Automated backups** | Point-in-time restore | Retention 1 to 35 days |
| **Snapshots** | Manual, long-lived backups | Can be copied cross-region |

> Multi-AZ is for availability, not read scaling. Read replicas are for scaling reads, not for failover (promotion takes manual or scripted action).

### Aurora

Aurora separates compute from a distributed storage layer that replicates six copies across three AZs. Failover typically takes under 30 seconds, and up to 15 read replicas can share the same storage. Aurora Serverless v2 scales capacity in small increments.

### Create an instance

```bash
aws rds create-db-instance \
  --db-instance-identifier orders-db \
  --engine postgres --engine-version 16.3 \
  --db-instance-class db.t4g.medium \
  --allocated-storage 100 --storage-type gp3 --storage-encrypted \
  --master-username orders_admin --manage-master-user-password \
  --multi-az \
  --db-subnet-group-name orders-db-subnets \
  --vpc-security-group-ids sg-0db0000000000000a \
  --no-publicly-accessible \
  --backup-retention-period 7 \
  --deletion-protection
```

`--manage-master-user-password` stores the password in Secrets Manager and rotates it, so no one types it into a terminal.

```output
{
    "DBInstance": {
        "DBInstanceIdentifier": "orders-db",
        "DBInstanceStatus": "creating",
        "MultiAZ": true,
        "PubliclyAccessible": false
    }
}
```

### Connection from an application

Use the RDS endpoint (or the Aurora cluster endpoint for writes, the reader endpoint for reads). Connection pooling matters, because each connection costs memory on the server. Use RDS Proxy for Lambda and bursty workloads.

```python
import os
import psycopg2

conn = psycopg2.connect(
    host=os.environ["DB_HOST"],          # orders-db.abc123.us-east-1.rds.amazonaws.com
    dbname="orders",
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],  # from Secrets Manager, never in code
    sslmode="require",
)
with conn, conn.cursor() as cur:
    cur.execute("SELECT id, status FROM orders WHERE id = %s", ("o-1001",))
    print(cur.fetchone())
```

## DynamoDB

DynamoDB is a fully managed key-value and document database. It is serverless: no instances, no patching, and it scales from zero to millions of requests per second. Access is by **primary key**, and the data model is designed around the access patterns you need.

### Keys

| Key | Parts | Purpose |
|---|---|---|
| **Partition key** (simple primary key) | One attribute, e.g. `orderId` | Lookup by ID |
| **Composite primary key** | Partition key + sort key, e.g. `customerId` + `orderDate` | One customer's orders, sorted by date |

Items with the same partition key live in the same partition. A hot partition (one key getting most of the traffic) throttles even when the table has spare capacity. Choose keys with high cardinality.

### Create a table

```bash
aws dynamodb create-table \
  --table-name orders \
  --attribute-definitions AttributeName=customerId,AttributeType=S AttributeName=orderDate,AttributeType=S \
  --key-schema AttributeName=customerId,KeyType=HASH AttributeName=orderDate,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --sse-specification Enabled=true \
  --deletion-protection-enabled
```

### Read and write

```python
import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource("dynamodb", region_name="us-east-1").Table("orders")

table.put_item(Item={
    "customerId": "c-42",
    "orderDate": "2026-10-27T09:14:00Z",
    "orderId": "o-1001",
    "total": 129,
    "status": "SHIPPED",
})

# Query: all orders for one customer in a date range (uses the key, cheap)
resp = table.query(
    KeyConditionExpression=Key("customerId").eq("c-42")
                         & Key("orderDate").between("2026-10-01", "2026-10-31"),
    ScanIndexForward=False,   # newest first
    Limit=10,
)
for item in resp["Items"]:
    print(item["orderId"], item["status"])
```

```output
o-1001 SHIPPED
```

A **Scan** reads the entire table and is expensive. Use Query with a key, and add indexes for other access patterns.

### Secondary indexes

| Index | Key | Consistency |
|---|---|---|
| **GSI** (global secondary index) | Any attribute as partition and optional sort key | Eventually consistent; own capacity |
| **LSI** (local secondary index) | Same partition key, different sort key | Strong consistency possible; created with the table |

```bash
aws dynamodb update-table \
  --table-name orders \
  --attribute-definitions AttributeName=status,AttributeType=S AttributeName=orderDate,AttributeType=S \
  --global-secondary-index-updates '[{"Create":{"IndexName":"by-status","KeySchema":[{"AttributeName":"status","KeyType":"HASH"},{"AttributeName":"orderDate","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}}]'
```

### Capacity modes

| Mode | Billing | Use when |
|---|---|---|
| **On-demand** | Per request | Unpredictable or new workloads |
| **Provisioned** (with auto scaling) | Per read/write capacity unit per hour | Steady, predictable traffic; cheaper at scale |

### Streams and TTL

- **DynamoDB Streams** emit a change record for every insert, update and delete. Lambda can consume them to update search indexes or send events.
- **Time to Live (TTL)** deletes expired items automatically at no write cost. Use it for sessions and temporary records.

## Data warehousing: Amazon Redshift

Redshift is a columnar, massively parallel (MPP) data warehouse for analytics over very large datasets. Transactional databases (RDS, Aurora) are built for many small reads and writes; Redshift is built for scanning and aggregating billions of rows.

| Concept | Meaning |
|---|---|
| **Cluster** | Leader node plus compute nodes; or Serverless with capacity measured in RPUs |
| **Columnar storage** | Reads only the columns a query needs, and compresses similar values together |
| **Distribution style** | How rows are spread across nodes: `KEY`, `EVEN`, `ALL` |
| **Sort key** | Physical order of rows; speeds range filters, such as by date |
| **Redshift Spectrum** | Query data in S3 without loading it |
| **Zero-ETL integrations** | Replicate from Aurora or DynamoDB into Redshift without building pipelines |

```sql
CREATE TABLE sales_fact (
    sale_id      BIGINT,
    sale_date    DATE,
    customer_id  BIGINT,
    amount       DECIMAL(12,2)
)
DISTKEY (customer_id)
SORTKEY (sale_date);

COPY sales_fact
FROM 's3://analytics-raw-123456789012/sales/2026/10/'
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftLoadRole'
FORMAT AS PARQUET;

SELECT date_trunc('month', sale_date) AS month, SUM(amount) AS revenue
FROM sales_fact
WHERE sale_date >= '2026-01-01'
GROUP BY 1
ORDER BY 1;
```

```output
     month     |   revenue
---------------+-------------
 2026-01-01    |  1284930.45
 2026-02-01    |  1190227.80
```

Use `COPY` to load bulk data from S3 in parallel; row-by-row inserts are slow in a warehouse. Use Parquet or ORC rather than CSV for speed and cost. Pause or scale down clusters, or use Serverless, to avoid paying for idle capacity.

| Need | Choose |
|---|---|
| Application transactions and lookups | RDS or Aurora |
| Single-digit millisecond key-value access at scale | DynamoDB |
| Analytics and BI over large history | Redshift |
| Ad hoc queries over files in S3 without loading | Athena (or Redshift Spectrum) |

## Choosing between them

| Question | If yes |
|---|---|
| Relational data with joins and transactions across tables? | RDS or Aurora |
| Known access patterns, need single-digit millisecond latency at huge scale? | DynamoDB |
| Serverless with spiky traffic and no capacity planning? | DynamoDB (on-demand) or Aurora Serverless v2 |
| Team knows SQL and the app already uses an ORM? | RDS or Aurora |
| Ad-hoc queries over years of data? | Redshift or Athena on S3 |

## Backups and recovery

| Service | Backup options |
|---|---|
| RDS / Aurora | Automated backups with point-in-time restore; manual snapshots |
| DynamoDB | On-demand backups; point-in-time recovery (35 days) |
| Both | AWS Backup for a central policy across services |

Test restores. A backup that has never been restored is a hope, not a plan.

## Non-Functional Requirements and Disaster Recovery

The database sets the floor for recovery. If the only way back is a restore from backup, the database alone will miss a 5-minute target, whatever the application does.

### Non-functional requirements

| Requirement | Target | Option |
|---|---|---|
| Survive an AZ failure with no manual step | Under 1 minute | Multi-AZ DB cluster with two readable standbys (failover typically under 35 seconds), or Aurora (typically under 30 seconds) |
| No data loss within a region | RPO of zero | Commits wait for a copy in another AZ; Aurora stores six copies across three AZs |
| Survive a region failure | Under 5 minutes | Aurora Global Database, or DynamoDB global tables |
| Recover from bad writes | Any point in the retention window | Point-in-time recovery (RDS 1 to 35 days; DynamoDB 35 days) |

### Region failure options

**Aurora Global Database** replicates to a secondary region asynchronously. An unplanned failover can lose the writes that had not yet reached that region, measured in seconds. A planned switchover has an RPO of zero, because the secondary catches up before the switch. AWS describes the RTO of an unplanned failover as on the order of minutes, so script the promotion and rehearse it before you rely on it for a 5-minute target.

**DynamoDB global tables** are active-active. Every Region accepts writes, so there is no promotion step: clients use the nearest healthy Region. The default mode resolves conflicting writes to the same item by timestamp, and the older write is dropped. Design writes so two Regions rarely update the same item at once. Multi-Region tables carry a 99.999% availability SLA.

**Cross-region read replicas** are a disaster recovery copy, not a fast failover. Promotion is a manual or scripted step, and the replica can lag behind the primary.

### Replication is not a backup

Replication copies mistakes. A dropped table or a bad migration reaches every replica within seconds. Keep point-in-time recovery, and copy snapshots to another region. Test a restore on the schedule described in Backups and recovery above.

## Key takeaways

- Multi-AZ or Aurora covers an AZ failure without a manual step. A region failure needs Aurora Global Database or DynamoDB global tables, plus a rehearsed runbook, because 5 minutes is tight for a promotion.
- RDS Multi-AZ gives failover; read replicas give read scale. They are not interchangeable.
- Use RDS Proxy or pooling for Lambda and many short connections.
- DynamoDB is designed around access patterns: choose the partition key for high cardinality, and use Query, not Scan.
- Use GSIs for extra access patterns; use TTL and Streams for cleanup and events.
- Encrypt at rest, keep databases in private subnets, and enable deletion protection.
