# OIDC and Keycloak: Authentication for Apps and APIs

**OpenID Connect (OIDC)** is an identity layer on top of OAuth 2.0. OAuth answers "what is this app allowed to do?" with access tokens. OIDC adds "who is the user?" with an **ID token**. **Keycloak** is an open-source identity provider (IdP) that implements OIDC. It handles login, MFA and user management, so your apps never store passwords.

## Core terms

| Term | Meaning |
|---|---|
| Identity provider (IdP) | Authenticates users and issues tokens. Keycloak, Okta, Entra ID, Cognito |
| Relying party (client) | Your app or API that trusts the IdP |
| Realm | Keycloak's tenant. Users, clients, roles and signing keys live in a realm |
| Client | An application registered in a realm. *Confidential* clients hold a secret (server-side apps). *Public* clients have none (SPAs, mobile) |
| ID token | JWT that says who logged in: `sub`, `email`, `name`, `iss`, `aud`, `exp` |
| Access token | JWT sent to an API as `Authorization: Bearer <token>`. Carries scopes and roles |
| Refresh token | Gets new access tokens without a new login |
| Scope | What the client asks for: `openid` (required for an ID token), `profile`, `email`, `offline_access` |

## Discovery and signing keys

Every OIDC provider publishes its metadata at `/.well-known/openid-configuration`. It lists the endpoints and the JWKS URI, where the public keys for verifying token signatures live. Clients and APIs read this document instead of hardcoding URLs.

For a Keycloak realm named `demo` on localhost, the endpoints are:

| Endpoint | URL |
|---|---|
| Discovery | `http://localhost:8080/realms/demo/.well-known/openid-configuration` |
| Authorize | `http://localhost:8080/realms/demo/protocol/openid-connect/auth` |
| Token | `http://localhost:8080/realms/demo/protocol/openid-connect/token` |
| UserInfo | `http://localhost:8080/realms/demo/protocol/openid-connect/userinfo` |
| JWKS (public keys) | `http://localhost:8080/realms/demo/protocol/openid-connect/certs` |

Keycloak 17 and later dropped the `/auth` prefix. Older tutorials show `/auth/realms/...`, which no longer works.

## Which flow to use

| Flow | Use for | Notes |
|---|---|---|
| Authorization Code + PKCE | Browser SPAs, mobile apps, server-rendered web apps | Current recommendation. The user logs in at the IdP |
| Client Credentials | Service-to-service calls and batch jobs | No user involved. Returns an access token only |
| Refresh token | Keeping a session alive | Exchanged at the token endpoint |
| Implicit, Resource Owner Password | Don't use | Removed in OAuth 2.1 |

## Run Keycloak locally

```bash
docker run --name keycloak -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=change-me \
  quay.io/keycloak/keycloak:26.4 start-dev
```

Pin the current Keycloak release. `start-dev` uses an embedded database and plain HTTP, so it is for learning only. Production runs `start` behind TLS, with an external database and `KC_HOSTNAME` set.

Open `http://localhost:8080`, sign in with the bootstrap admin, and continue with the setup below.

## Set up a realm and clients

1. Create a realm named `demo`.
2. Create a user `alice`. Set an email and a password, and turn off *Temporary*.
3. Create a public client `wiki-web` for the browser app:
   - Client authentication: **off**
   - Standard flow: **on**
   - Valid redirect URIs: `http://localhost:3000/*`
   - Web origins: `http://localhost:3000`
   - Advanced → PKCE Code Challenge Method: **S256**
4. Create a confidential client `service-a` for machine-to-machine calls:
   - Client authentication: **on**
   - Service accounts roles: **on**
   - Copy its secret from the Credentials tab.

Check the discovery document:

```bash
curl -s http://localhost:8080/realms/demo/.well-known/openid-configuration | jq '{issuer, token_endpoint, jwks_uri}'
```

## Client credentials: service to service

```bash
curl -s -X POST http://localhost:8080/realms/demo/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=service-a \
  -d client_secret="$SERVICE_A_SECRET"
```

The response contains `access_token`, `token_type` and `expires_in`. Send the token to an API as `Authorization: Bearer <token>`.

To see the claims inside a token, decode its payload. This is for learning only, since decoding doesn't verify the signature:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/demo/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=service-a -d client_secret="$SERVICE_A_SECRET" | jq -r .access_token)

python3 -c 'import sys,json,base64
p = sys.stdin.read().split(".")[1]
p += "=" * (-len(p) % 4)
print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))' <<< "$TOKEN"
```

## Authorization Code + PKCE: browser login

PKCE protects the code exchange without a client secret. Generate a verifier and its S256 challenge:

```bash
VERIFIER=$(openssl rand -hex 32)
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
```

Send the user to the authorize endpoint. `state` guards against CSRF and `nonce` against replayed ID tokens. Your app must check both on return:

```
http://localhost:8080/realms/demo/protocol/openid-connect/auth?client_id=wiki-web&response_type=code&scope=openid%20profile%20email&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&code_challenge=$CHALLENGE&code_challenge_method=S256&state=xyz123&nonce=abc456
```

After login, Keycloak redirects to `http://localhost:3000/callback?code=...&state=xyz123`. Exchange the code, with the verifier and no secret:

```bash
curl -s -X POST http://localhost:8080/realms/demo/protocol/openid-connect/token \
  -d grant_type=authorization_code \
  -d client_id=wiki-web \
  -d code="$CODE" \
  -d redirect_uri=http://localhost:3000/callback \
  -d code_verifier="$VERIFIER"
```

The response has `id_token`, `access_token` and `refresh_token`. Renew the access token with the refresh token:

```bash
curl -s -X POST http://localhost:8080/realms/demo/protocol/openid-connect/token \
  -d grant_type=refresh_token \
  -d client_id=wiki-web \
  -d refresh_token="$REFRESH_TOKEN"
```

## Protect a Spring Boot API

The API is an OAuth 2.0 **resource server**. It doesn't log users in. It checks the access token on each request.

Add `spring-boot-starter-oauth2-resource-server` to `pom.xml`, then point it at the realm:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://localhost:8080/realms/demo
```

Spring reads the discovery document, fetches the JWKS, and checks the signature, `iss` and `exp` on every request.

Keycloak puts realm roles in a `realm_access.roles` claim, which Spring doesn't read by default. This configuration maps them to `ROLE_` authorities:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/public/**").permitAll()
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth
                .jwt(jwt -> jwt.jwtAuthenticationConverter(keycloakRolesConverter())));
        return http.build();
    }

    JwtAuthenticationConverter keycloakRolesConverter() {
        JwtGrantedAuthoritiesConverter scopes = new JwtGrantedAuthoritiesConverter();
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Collection<GrantedAuthority> authorities = new ArrayList<>(scopes.convert(jwt));
            Map<String, Object> realmAccess = jwt.getClaim("realm_access");
            if (realmAccess != null && realmAccess.get("roles") instanceof List<?> roles) {
                roles.forEach(role -> authorities.add(new SimpleGrantedAuthority("ROLE_" + role)));
            }
            return authorities;
        });
        return converter;
    }
}
```

Imports from `org.springframework.security` and `java.util` are omitted.

A controller can read the verified token directly:

```java
@RestController
public class MeController {

    @GetMapping("/api/me")
    Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
        return jwt.getClaims();
    }
}
```

Test the three outcomes:

| Request | Result |
|---|---|
| No token | `401 Unauthorized` |
| Token with a wrong `iss`, or an expired token | `401 Unauthorized` |
| Valid token without the `ADMIN` role, calling `/admin/**` | `403 Forbidden` |

## Claims to check

- **`iss`** must match the issuer the API is configured for. Spring checks it when you set `issuer-uri`.
- **`aud`**: Keycloak's default user tokens have `aud` set to `account`, so an API that validates audience won't accept them. Add an *Audience* mapper in the client scope that includes your API's client ID.
- **`exp`** and **signature** are checked automatically. Never trust the payload of a token you've only decoded.

## Common problems

- **Issuer mismatch.** The `iss` claim uses the hostname the client used. A token issued to `localhost:8080` won't validate against an API configured for `keycloak:8080`. Set `KC_HOSTNAME` to the address clients use.
- **`Invalid parameter: redirect_uri`.** The redirect URI must match a registered value exactly.
- **Roles missing.** Check the user has the realm role and the client scope includes the roles mapper.
- **Secrets in the browser.** Confidential client secrets stay on the server. Browser apps use PKCE with no secret.
- **Clock skew.** Token expiry checks fail when server clocks differ by minutes. Keep hosts time-synced.

## Key takeaways

- Authorization Code + PKCE is for users. Client Credentials is for services.
- Let the framework verify tokens against the issuer's JWKS. Check `iss`, `aud`, `exp` and the signature.
- Map the IdP's roles to your app's authorities. Keycloak uses `realm_access.roles`.
- Keep client secrets and tokens out of browser code, logs and git.
