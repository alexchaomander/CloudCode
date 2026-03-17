# Tailscale Configuration for CloudCode

CloudCode is designed to be accessed over a private Tailscale network from your phone or other devices. This guide explains how to set it up securely.

## Overview

The security model has two layers for Tailscale:

1. **Network layer** — CloudCode only listens on your Tailscale interface (or localhost), never publicly
2. **Identity layer** — CloudCode validates the `X-Tailscale-User` header to ensure only approved tailnet identities can access the app

---

## Step 1: Install Tailscale

Follow the [Tailscale installation guide](https://tailscale.com/download) for your platform.

```bash
# Linux
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

---

## Step 2: Find Your Tailscale IP

```bash
tailscale ip -4
# Example output: 100.64.0.1
```

---

## Step 3: Configure CloudCode to Listen on Tailscale IP

In your `.env`:

```env
HOST=100.64.0.1   # Your Tailscale IP
PORT=3000
APP_BASE_URL=http://100.64.0.1:3000
```

This ensures CloudCode is only reachable over Tailscale, not the public internet.

---

## Step 4: Enable Identity Validation (Optional but Recommended)

CloudCode can validate the `X-Tailscale-User` header injected by `tailscale serve` to restrict access to specific tailnet identities.

In your `.env`:

```env
TAILSCALE_ALLOWED_IDENTITIES=your@tailscale-identity.com
```

To find your Tailscale identity:

```bash
tailscale status --json | jq '.Self.UserID'
```

Or check [Tailscale admin console](https://login.tailscale.com/admin/machines).

---

## Step 5: Use `tailscale serve` for HTTPS (Recommended)

`tailscale serve` provides automatic HTTPS with a `*.ts.net` domain:

```bash
tailscale serve --bg http://localhost:3000
```

This makes CloudCode available at:
```
https://your-machine-name.tail-abc123.ts.net
```

With identity headers automatically injected for validation.

Update `.env`:

```env
APP_BASE_URL=https://your-machine-name.tail-abc123.ts.net
HOST=127.0.0.1  # Listen on localhost since tailscale serve handles the proxy
```

---

## Step 6: Access from Phone

1. Install Tailscale on your iPhone/Android
2. Connect to your tailnet
3. Open `http://<tailscale-ip>:3000` or your `*.ts.net` URL
4. Log in with your CloudCode credentials

---

## Security Checklist

- [ ] CloudCode `HOST` is set to Tailscale IP (not `0.0.0.0`)
- [ ] `TAILSCALE_ALLOWED_IDENTITIES` is configured
- [ ] Strong `SESSION_SECRET` is set (64+ char random string)
- [ ] Firewall blocks port 3000 from non-Tailscale interfaces
- [ ] Consider using `tailscale serve` for automatic HTTPS

---

## Firewall Configuration (UFW)

If using ufw, ensure Tailscale traffic is allowed but the port is blocked on other interfaces:

```bash
# Allow Tailscale interface
sudo ufw allow in on tailscale0 to any port 3000

# Block from other interfaces
sudo ufw deny 3000
```

---

## Troubleshooting

### Can't connect from phone

- Verify both devices are on the same tailnet: `tailscale status`
- Check CloudCode is listening on the right IP: `ss -tlnp | grep 3000`
- Ensure firewall allows Tailscale traffic

### Identity validation rejecting requests

- Check the `X-Tailscale-User` header is being sent (requires `tailscale serve`)
- Verify `TAILSCALE_ALLOWED_IDENTITIES` matches exactly (case-sensitive)
- Check CloudCode logs: `journalctl -u cloudcode@$USER -f`
