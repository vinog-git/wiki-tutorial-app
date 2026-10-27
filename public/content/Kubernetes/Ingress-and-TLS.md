# Kubernetes: Ingress and TLS

A LoadBalancer Service gives you one cloud load balancer per Service. For a cluster with ten HTTP APIs that means ten load balancers. An **Ingress** lets one entry point route requests by host name and path to many Services.

An Ingress is only a set of rules. It needs an **Ingress controller** to act on them. Popular choices are NGINX Ingress Controller, AWS Load Balancer Controller (creates an ALB), Traefik, and Istio gateways.

```
Internet → one load balancer → Ingress controller → /orders → Service orders
                                                  → /users  → Service users
                                                  → /       → Service web
```

## Install an Ingress controller (NGINX example)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

## Basic Ingress with host and path routing

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx          # which controller should handle this
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /orders(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: orders
                port:
                  number: 80
          - path: /users(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: users
                port:
                  number: 80
```

```bash
kubectl apply -f ingress.yaml
kubectl get ingress shop
```

```output
NAME   CLASS   HOSTS              ADDRESS                                  PORTS   AGE
shop   nginx   shop.example.com   a1b2c3-1234.elb.us-east-1.amazonaws.com  80      15s
```

Test it before DNS is set up by sending the Host header yourself:

```bash
curl -H "Host: shop.example.com" http://a1b2c3-1234.elb.us-east-1.amazonaws.com/orders/health
```

## TLS with cert-manager

Store the certificate in a TLS Secret and reference it in the Ingress. **cert-manager** can request and renew certificates from Let's Encrypt automatically.

```yaml
# clusterissuer.yaml (one-time setup)
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform-team@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

```yaml
# Add to the Ingress
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - shop.example.com
      secretName: shop-tls          # cert-manager creates and renews this Secret
  rules:
    # ... same as above
```

```bash
kubectl get certificate
kubectl describe certificate shop-tls   # shows Ready=True once issued
```

## Gateway API (the successor)

The Gateway API is the newer, more expressive standard for the same job. It separates roles: the platform team owns a `Gateway`, and app teams attach `HTTPRoute` objects.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: orders
spec:
  parentRefs:
    - name: public-gateway
  hostnames:
    - shop.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /orders
      backendRefs:
        - name: orders
          port: 80
```

## Key takeaways

- An Ingress is routing rules; an Ingress controller enforces them.
- One cloud load balancer can serve many services through host and path rules.
- Set `ingressClassName` explicitly so the right controller picks up the rule.
- Terminate TLS at the Ingress, and automate certificates with cert-manager.
