# Tailscale Configuration Example

Run CloudCode only on your tailnet:

```bash
tailscale serve --https=443 http://127.0.0.1:3001
```

Set `TAILSCALE_ALLOWED_IDENTITIES` to approved logins, e.g.

```bash
export TAILSCALE_ALLOWED_IDENTITIES="me@example.com"
```
