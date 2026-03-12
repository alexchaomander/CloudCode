# Security Policy

## Supported Versions

CloudCode is currently in early release. Security fixes are applied to the latest version on `main`.

| Version | Supported |
|---------|-----------|
| latest (main) | ✅ |

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, email the maintainer directly or open a [GitHub Security Advisory](https://github.com/alexchaomander/CloudCode/security/advisories/new) (private disclosure).

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any proof-of-concept code (if applicable)
- Your suggested fix (if you have one)

You can expect an acknowledgement within **48 hours** and a resolution timeline within **7 days** for critical issues.

---

## Security Design Notes

CloudCode is a **single-owner, self-hosted tool** that executes local commands on your workstation. Keep the following in mind:

- **Never expose CloudCode to the public internet.** It is designed to run behind Tailscale or on localhost only.
- **Set a strong `SESSION_SECRET`** — use `openssl rand -hex 64` to generate one.
- **Enable Tailscale identity validation** (`TAILSCALE_ALLOWED_IDENTITIES`) to restrict access to your own tailnet identity.
- **Agent profiles run arbitrary commands** as the user running CloudCode. Only add profiles you trust.
- **Repo roots restrict working directories** — always register explicit roots rather than allowing arbitrary paths.

See [docs/tailscale.md](docs/tailscale.md) for the full recommended deployment setup.
