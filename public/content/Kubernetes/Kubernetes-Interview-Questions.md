# Kubernetes Interview Questions

Short answers first, then depth where interviewers usually probe. Each answer links to the page that covers it.

## Fundamentals

**1. What is Kubernetes?**
An open-source container orchestrator. It schedules containers onto a cluster of machines, keeps the actual state matching the desired state declared in YAML, handles self-healing, scaling, rolling updates and service discovery. *(See Overview.)*

**2. Explain the control plane components.**
- `kube-apiserver`: the front door; all reads and writes go through it.
- `etcd`: the consistent key-value store holding all cluster state.
- `kube-scheduler`: assigns pods to nodes.
- `kube-controller-manager`: runs control loops that reconcile actual state with desired state.
*(See Overview.)*

**3. What runs on each worker node?**
`kubelet` (makes sure the pods on the node run), `kube-proxy` (Service networking rules), and a container runtime such as containerd. *(See Overview.)*

**4. What is a pod, and why not run containers directly?**
A pod is the smallest deployable unit: one or more containers sharing a network namespace and volumes. Kubernetes manages pods, so it can schedule, restart and scale them. *(See Pods and Deployments.)*

**5. Pod vs Deployment vs ReplicaSet?**
A pod runs containers. A ReplicaSet keeps N identical pods alive. A Deployment manages ReplicaSets so you get rolling updates and rollbacks. You almost always create a Deployment. *(See Pods and Deployments.)*

**6. What is a StatefulSet and when do you use it?**
A workload that gives each pod a stable name (`db-0`, `db-1`), stable storage, and ordered start/stop. Used for databases and clustered systems like Kafka. *(See Storage.)*

**7. DaemonSet, Job and CronJob?**
DaemonSet: one pod per node (log or monitoring agents). Job: run to completion. CronJob: Job on a schedule. *(See Pods and Deployments.)*

## Networking

**8. What are the Service types?**
ClusterIP (internal only, the default), NodePort (a port on every node), LoadBalancer (cloud load balancer), ExternalName (DNS alias), and headless (`clusterIP: None`, DNS returns pod IPs). *(See Services.)*

**9. How does a Service find its pods?**
By label selector. The control plane maintains an Endpoints (or EndpointSlice) object listing the IPs of ready pods that match. *(See Services.)*

**10. Ingress vs LoadBalancer Service?**
A LoadBalancer Service creates one cloud load balancer per Service. An Ingress uses one entry point with host and path rules to route to many Services, and needs an Ingress controller. *(See Ingress.)*

**11. What is a NetworkPolicy?**
A rule set that restricts which pods can send or receive traffic. Pods are open by default; NetworkPolicy only takes effect if the CNI plugin supports it. *(See Services and Security.)*

## Configuration and security

**12. ConfigMap vs Secret?**
Both inject configuration into pods. Secrets are intended for sensitive data and are base64-encoded, which is not encryption. Enable encryption at rest and restrict access with RBAC. *(See ConfigMaps and Secrets.)*

**13. How do you get a config change into running pods?**
Env vars are read at start, so restart the rollout (`kubectl rollout restart`). Mounted ConfigMap volumes update in place, though the app must reload them. *(See ConfigMaps and Secrets.)*

**14. What is RBAC?**
Role-based access control. A Role (or ClusterRole) defines verbs on resources; a RoleBinding (or ClusterRoleBinding) grants it to a user, group or ServiceAccount. *(See Security.)*

**15. Why not use the default ServiceAccount for everything?**
Each workload should have its own ServiceAccount with least privilege. Disable token mounting when the app does not call the API. *(See Security.)*

## Health, resources and scaling

**16. Liveness vs readiness vs startup probe?**
Liveness failing restarts the container. Readiness failing removes the pod from Service endpoints without restarting it. Startup holds back the other probes until a slow app has started. *(See Probes.)*

**17. Why must liveness probes avoid checking dependencies?**
If a shared database goes down, every pod fails its liveness probe and restarts, which turns a partial outage into a full one. *(See Probes.)*

**18. Requests vs limits?**
Requests are what the scheduler reserves when placing a pod. Limits are the maximum usage. CPU over the limit is throttled; memory over the limit kills the container (OOMKilled). *(See Probes.)*

**19. What are QoS classes?**
Guaranteed (requests equal limits), Burstable (some set), BestEffort (none set). Under memory pressure BestEffort pods are evicted first. *(See Probes.)*

**20. What is a PodDisruptionBudget?**
It limits how many pods voluntary disruptions, such as node drains during upgrades, may take down at the same time. *(See Probes.)*

**21. HPA vs VPA vs Cluster Autoscaler?**
HPA changes replica count based on metrics. VPA changes pod resource requests. Cluster Autoscaler (or Karpenter) changes the number of nodes. *(See [Autoscaling](/Kubernetes/Autoscaling).)*

**22. Why does an HPA not scale when CPU looks high?**
Common causes: metrics-server is missing, or the pods have no CPU requests set, so utilization cannot be calculated. *(See [Autoscaling](/Kubernetes/Autoscaling).)*

## Operations

**23. Deployment strategies?**
RollingUpdate (default; replaces pods gradually, controlled by `maxSurge` and `maxUnavailable`), Recreate (stop all, then start new), and blue/green or canary (usually with a traffic tool such as Argo Rollouts or a service mesh). *(See Pods and Deployments.)*

**24. How do you roll back?**
`kubectl rollout undo deployment/<name>`, or `helm rollback`, or revert the commit in GitOps. *(See Pods and Deployments and Helm.)*

**25. A pod is stuck in CrashLoopBackOff. What do you do?**
`kubectl describe pod` for events, `kubectl logs --previous` for the crashed container's output, then check config, secrets and probes. *(See Troubleshooting.)*

**26. A pod is Pending. Why?**
Usually insufficient CPU or memory on nodes, an unbound PVC, a node selector or taint that matches no node, or a failed image pull later on. Check events. *(See Troubleshooting.)*

**27. How do you drain a node for maintenance?**
`kubectl cordon <node>` to stop new scheduling, then `kubectl drain <node> --ignore-daemonsets`, which evicts pods and respects PodDisruptionBudgets. Then upgrade and `kubectl uncordon`. *(See Troubleshooting.)*

**28. Helm vs Kustomize?**
Helm packages templated charts with values and release history; good for third-party software. Kustomize layers plain YAML with overlays; no templates. *(See Helm and Kustomize.)*

**29. What is GitOps?**
Desired state lives in git. A controller such as Argo CD or Flux syncs the cluster to match it and reports drift. Rollback is a git revert. *(See Helm and Kustomize.)*

**30. How would you run Kubernetes on AWS?**
EKS for the control plane, managed node groups or Karpenter for capacity, IRSA or Pod Identity for AWS permissions, the AWS Load Balancer Controller for Ingress, and EBS or EFS CSI drivers for storage. *(See EKS.)*

## Scenario questions

**31. Design a zero-downtime deployment for a REST API.**
Use a Deployment with `maxUnavailable: 0`, readiness probes so new pods only receive traffic when ready, a `preStop` sleep and enough `terminationGracePeriodSeconds` for in-flight requests, and a PodDisruptionBudget for maintenance. Roll back with `rollout undo` if error rates rise.

**32. A service suddenly returns 503 through the Ingress. Walk through the checks.**
1. Ingress has an address and the right `ingressClassName`.
2. Service selector matches pods (`kubectl get endpoints`).
3. Pods are Ready (readiness probe passing).
4. Ports match: Service `targetPort` equals the container port.
5. NetworkPolicy or security group is not blocking the controller.
6. Recent rollout: `kubectl rollout history` and the controller's logs.

**33. How would you keep a database safe on Kubernetes?**
StatefulSet with `volumeClaimTemplates`, encrypted storage class with `reclaimPolicy: Retain`, regular snapshots (Velero or cloud snapshots), a tested restore procedure, and credentials from an external secret store. Many teams choose a managed database such as RDS instead.

**34. How do you limit one team from affecting another in a shared cluster?**
Namespaces per team, ResourceQuota and LimitRange, RBAC scoped to their namespaces, NetworkPolicy default-deny, and Pod Security `restricted` labels.

## Quick-fire

- **Namespace?** A logical partition of a cluster for teams or environments.
- **What does `kubectl apply` do?** Creates or updates objects to match the file, using a three-way merge.
- **Where is state stored?** In etcd.
- **What does `kubectl explain` do?** Shows the documentation for any field in the API.
- **Taint vs toleration?** A taint repels pods from a node; a toleration lets a pod ignore that taint.
- **Node affinity vs node selector?** Selector is a simple equality match; affinity supports rules such as "prefer" and expressions.
- **Pod anti-affinity?** Spreads replicas across nodes or zones so one failure does not remove all copies.
- **What is a sidecar?** A second container in the pod that adds a capability, such as logging or a service-mesh proxy.
