# Security Policy

CloudCode executes local coding-agent CLI workflows and should be treated as a high-trust application.

## Reporting a vulnerability

Please report vulnerabilities privately by contacting maintainers directly. Do not disclose exploitable details in public issues.

Include:
- affected version/commit
- reproduction steps
- impact assessment
- proposed mitigation if known

## Security expectations for deployments

- run only on localhost or private tailnet access
- set a strong `SESSION_SECRET`
- configure `TAILSCALE_ALLOWED_IDENTITIES`
- keep tmux and Node runtime patched
- avoid public internet exposure
