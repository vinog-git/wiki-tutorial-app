# AWS: VPC and Networking

A **VPC** (Virtual Private Cloud) is your private, isolated network inside a region. You choose the IP range, split it into subnets across AZs, and control traffic with route tables, security groups and network ACLs. Every EC2 instance, ECS task, RDS database and EKS node lives in a VPC.

## Building blocks

| Component | Purpose |
|---|---|
| **VPC** | Isolated network with a CIDR block, e.g. `10.0.0.0/16` (65,536 addresses) |
| **Subnet** | A slice of the VPC in one AZ, e.g. `10.0.1.0/24` |
| **Route table** | Rules that decide where traffic goes |
| **Internet Gateway (IGW)** | Connects public subnets to the internet |
| **NAT Gateway** | Lets private subnets make outbound internet calls; no inbound |
| **Security group** | Stateful firewall attached to an instance or ENI |
| **Network ACL (NACL)** | Stateless firewall on a subnet boundary |
| **VPC endpoint** | Private connection to AWS services (S3, DynamoDB, ECR) without going over the internet |
| **Peering / Transit Gateway** | Connects VPCs to each other |

## A standard two-tier layout

```
VPC 10.0.0.0/16
├── Public subnet A   10.0.1.0/24   (us-east-1a)  → route 0.0.0.0/0 → Internet Gateway
├── Public subnet B   10.0.2.0/24   (us-east-1b)  → route 0.0.0.0/0 → Internet Gateway
├── Private subnet A  10.0.11.0/24  (us-east-1a)  → route 0.0.0.0/0 → NAT Gateway (in public A)
├── Private subnet B  10.0.12.0/24  (us-east-1b)  → route 0.0.0.0/0 → NAT Gateway (in public B)
└── Database subnet A 10.0.21.0/24  (us-east-1a)  → no internet route
    Database subnet B 10.0.22.0/24  (us-east-1b)
```

Load balancers sit in public subnets. Application servers, ECS tasks and EKS nodes sit in private subnets. Databases sit in their own private subnets with no internet route.

## Create a VPC from the CLI

```bash
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=orders-vpc}]' \
  --query Vpc.VpcId --output text)

PUB_A=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a --query Subnet.SubnetId --output text)

PRIV_A=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1a --query Subnet.SubnetId --output text)

echo "VPC=$VPC_ID PUBLIC=$PUB_A PRIVATE=$PRIV_A"
```

```output
VPC=vpc-0a1b2c3d4e5f67890 PUBLIC=subnet-0aaa1111bbb22222c PRIVATE=subnet-0ddd3333eee44444f
```

Public subnets need a route to the internet gateway and `MapPublicIpOnLaunch` if instances should get public IPs:

```bash
IGW_ID=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

RT_PUB=$(aws ec2 create-route-table --vpc-id $VPC_ID --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $RT_PUB --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID
aws ec2 associate-route-table --route-table-id $RT_PUB --subnet-id $PUB_A
aws ec2 modify-subnet-attribute --subnet-id $PUB_A --map-public-ip-on-launch
```

## Security groups vs NACLs

| | Security group | Network ACL |
|---|---|---|
| Applies to | Instance / ENI | Subnet |
| Stateful? | Yes: return traffic is allowed automatically | No: inbound and outbound rules are separate |
| Rules | Allow only | Allow and deny, evaluated in number order |
| Default | Deny inbound, allow outbound | Allow all |
| Typical use | Primary control, referenced by other SGs | Coarse subnet-level block |

Reference other security groups instead of IP addresses. This keeps rules valid when instances change:

```bash
# Database accepts 5432 only from the application's security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-0db0000000000000a \
  --protocol tcp --port 5432 \
  --source-group sg-0app00000000000b
```

## NAT Gateway cost

A NAT Gateway is billed per hour and per GB processed. For a workload that calls S3 or ECR heavily, a **gateway VPC endpoint** for S3 (free) or an **interface endpoint** for ECR is cheaper and keeps traffic private.

```bash
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID --vpc-endpoint-type Gateway \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids $RT_PUB
```

## Connectivity between accounts and networks

| Need | Use |
|---|---|
| Two VPCs talk to each other (small number) | VPC peering (non-transitive) |
| Many VPCs and on-premises networks | Transit Gateway (hub and spoke) |
| Private access to a SaaS or your own service | AWS PrivateLink |
| Secure link to an office or data centre | Site-to-Site VPN or Direct Connect |

## Troubleshooting connectivity

Work outwards from the instance:

1. **Is the process listening?** `ss -tlnp` on the host
2. **Security group** allows the port from the caller's SG or CIDR
3. **NACL** allows both the request and the ephemeral return ports (1024-65535)
4. **Route table** of the subnet has the right route (IGW for public, NAT for private)
5. **Public IP / DNS** resolves to the expected address

```bash
aws ec2 describe-route-tables --route-table-ids $RT_PUB \
  --query "RouteTables[0].Routes[].[DestinationCidrBlock,GatewayId]" --output table
```

Reachability Analyzer (`aws ec2 create-network-insights-path`) traces the path and names the blocking component.

## Key takeaways

- A VPC is your network; subnets are per AZ; public means "route to an IGW".
- Put workloads in private subnets, and reach AWS services through VPC endpoints.
- Security groups are stateful and per resource; NACLs are stateless and per subnet.
- Reference security group IDs in rules, not IP addresses.
- NAT Gateways are a common surprise on the bill.
