# incus-image-server

A unified simplestreams image server for LXC/LXD/Incus, with a multi-distro
build pipeline and live-ISO remastering support.

## Structure

```
incus-image-server/
├── server/              # Elixir/Phoenix simplestreams server (polar base)
├── manifests/           # Distrobuilder YAMLs + wrapper scripts
├── chromiumos-stage3/   # Arch-agnostic ChromiumOS stage3 builder
├── penguins-eggs/       # ChromiumOS family support for penguins-eggs
└── demo-server/         # Deployment wrapper for incus-demo-server
    ├── config/          # Site-local configuration template
    ├── systemd/         # systemd service unit
    ├── scripts/         # install.sh and setup-incus.sh
    └── README.md
```

## Components

### server/
Phoenix application serving the simplestreams protocol for LXC, LXD, and Incus.
- Multi-tenant spaces with per-space credential generation
- Storage-backend agnostic: S3/S3-compatible or local filesystem
- Direct multipart upload endpoint alongside CI/CD publish pipeline
- No architecture or distro constraints in the data model

### manifests/
Distrobuilder YAML manifests and wrapper scripts covering:
- Debian, Ubuntu, Devuan, Alpine, Arch Linux
- Fedora, AlmaLinux, Rocky Linux, openSUSE
- Gentoo (OpenRC + systemd, container + VM)
- ChromiumOS (via stage3 wrapper script)
- Talos Linux (VM only, via wrapper script)

### chromiumos-stage3/
Parameterized ChromiumOS stage3 builder derived from sebanc/chromiumos-stage3.
Supports amd64 (`reven` board) and arm64 (generic + hardware-specific boards
from openFyde). Board configurations are in `boards/`.

### penguins-eggs/
ChromiumOS family backend for penguins-eggs live-ISO remastering tool.
Covers package management via Portage + Chromebrew, derivative detection,
and browser flavour selection.

### demo-server/
Deployment wrapper for [incus-demo-server](https://github.com/lxc/incus-demo-server),
the backend powering the Incus online try-it service. Provides a config
template, systemd unit, and install/setup scripts.

See [demo-server/README.md](demo-server/README.md) for setup instructions.

## Sources

| Component | Upstream |
|---|---|
| server | upmaru/polar |
| server upload | Hye-Ararat/Image-Server |
| manifests/ubuntu.yml | f-bn/incus-images |
| manifests/gentoo/ | liangyongxiang/my-gentoo-incus-scripts |
| chromiumos-stage3 (amd64) | sebanc/chromiumos-stage3 |
| chromiumos-stage3 (arm64) | openFyde overlays |
| penguins-eggs distro matrix | Interested-Deving-1896/penguins-eggs |
