# demo-server

Deployment wrapper for [incus-demo-server](https://github.com/lxc/incus-demo-server) —
the backend powering the Incus online try-it service at
[linuxcontainers.org/incus/try-it](https://linuxcontainers.org/incus/try-it).

## What it does

Spins up short-lived Incus containers on demand for anonymous users. Each
session is time-limited and resource-capped. The server exposes a REST API
consumed by the try-it web frontend.

## Structure

```
demo-server/
├── config/
│   └── config.yaml          # Site-local configuration (copy + edit)
├── systemd/
│   └── incus-demo-server.service   # systemd unit
├── scripts/
│   ├── install.sh           # Build and install the binary
│   └── setup-incus.sh       # Prepare the Incus side (profile, image)
└── README.md
```

## Prerequisites

- Go 1.21+
- Incus 6.x (rootful, socket at `/var/lib/incus/unix.socket`)
- A dedicated unprivileged system user: `incus-demo`

## Quick start

```bash
# 1. Build and install the binary
sudo bash scripts/install.sh

# 2. Configure
sudo cp config/config.yaml /etc/incus-demo-server/config.yaml
sudo $EDITOR /etc/incus-demo-server/config.yaml

# 3. Prepare Incus (profile + base image)
sudo bash scripts/setup-incus.sh

# 4. Enable and start
sudo systemctl enable --now incus-demo-server
```

## Configuration

See `config/config.yaml` for all options. Key settings:

| Key | Default | Description |
|---|---|---|
| `server.api.address` | `[::]:8080` | Listen address |
| `limits.total` | `64` | Max concurrent sessions |
| `limits.ip` | `3` | Max sessions per source IP |
| `limits.containers.memory` | `512MB` | Memory cap per container |
| `limits.containers.processes` | `50` | Process cap per container |
| `limits.containers.disk` | `5GB` | Disk cap per container |
| `limits.containers.time` | `30` | Session lifetime (minutes) |

## Upstream

Source: <https://github.com/lxc/incus-demo-server>
