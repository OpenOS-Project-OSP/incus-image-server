[update-readmes]   Mode: rewrite — migrating to template structure...
# incus-image-server

[![Built with Ona](https://ona.com/build-with-ona.svg)](https://app.ona.com/#https://github.com/Interested-Deving-1896/incus-image-server)

<!-- AI:start:what-it-does -->
This project provides a unified simplestreams image server for managing and distributing container images for LXC, LXD, and Incus. It includes a multi-distribution build pipeline and supports ChromiumOS stage3 builds, addressing the needs of developers and infrastructure teams managing diverse containerized environments.
<!-- AI:end:what-it-does -->

## Architecture

<!-- AI:start:architecture -->
The project consists of a unified simplestreams image server designed for LXC/LXD/Incus environments, with support for multi-distribution image builds and ChromiumOS stage3 workflows. The architecture is modular, with key components organized into directories and workflows that automate tasks such as image building, repository synchronization, and CI/CD operations. The server interacts with external repositories, mirrors, and build pipelines to manage and distribute images efficiently.

The directory structure is as follows:

```plaintext
.
├── .github/                  # GitHub workflows for CI/CD and automation
├── demo-server/              # Demo server configuration and related assets
├── dep-graph/                # Dependency graph generation scripts
├── scripts/                  # Utility scripts for various tasks
├── unified-image-server/     # Core server implementation and configuration
├── .gitignore                # Git ignore rules
├── LICENSE                   # License file
├── README.md                 # Project documentation
```

Workflows in `.github/workflows` handle tasks such as repository mirroring, image building, ChromiumOS stage3 processing, and CI for the demo server. The `unified-image-server` directory contains the main server logic, while `scripts` includes helper scripts for maintenance and automation.
<!-- AI:end:architecture -->

## Install

<!-- Add installation instructions here. This section is yours — the AI will not modify it. -->

```bash
git clone https://github.com/Interested-Deving-1896/incus-image-server.git
cd incus-image-server
```

## Usage

<!-- Add usage examples here. This section is yours — the AI will not modify it. -->

## Configuration

<!-- Document configuration options here. This section is yours — the AI will not modify it. -->

## CI

<!-- AI:start:ci -->
- **add-mirror-repo.yml**: Adds a new repository to the mirror list. Requires `GITHUB_TOKEN` and `MIRROR_REPO_SECRET`.
- **build-and-publish.yml**: Builds and publishes images to the simplestreams server. Requires `GITHUB_TOKEN`, `PUBLISH_SECRET`, and `DOCKERHUB_TOKEN`.
- **chromiumos-stage3-build.yml**: Builds ChromiumOS stage3 images. Requires `CHROMIUMOS_BUILD_SECRET`.
- **cleanup-pollution.yml**: Cleans up temporary files and artifacts from the repository. No secrets required.
- **demo-server-ci.yml**: Runs CI tasks for the demo server. Requires `DEMO_SERVER_TOKEN`.
- **mirror-artifacts.yml**: Mirrors build artifacts to external storage. Requires `ARTIFACT_STORAGE_SECRET`.
- **mirror-orgs-watchdog.yml**: Monitors and ensures synchronization of mirrored organizations. Requires `WATCHDOG_SECRET`.
- **sync-from-gitlab.yml**: Syncs repositories from GitLab to GitHub. Requires `GITLAB_TOKEN` and `GITHUB_TOKEN`.
- **sync-to-gitlab.yml**: Syncs repositories from GitHub to GitLab. Requires `GITLAB_TOKEN` and `GITHUB_TOKEN`.
- **rotate-token.yml**: Rotates access tokens for security. Requires `ROTATION_SECRET`.
- **server-ci.yml**: Executes CI tasks for the unified image server. Requires `SERVER_CI_SECRET`.
- **update-readmes.yml**: Updates README files across repositories. Requires `GITHUB_TOKEN`.
- **upstream-commits.yml**: Tracks and syncs upstream commits. Requires `UPSTREAM_TOKEN`.
- **upstream-prs.yml**: Monitors and syncs upstream pull requests. Requires `UPSTREAM_TOKEN`.
<!-- AI:end:ci -->

## Mirror chain

<!-- AI:start:mirror-chain -->
This repo is maintained in [`Interested-Deving-1896/incus-image-server`](https://github.com/Interested-Deving-1896/incus-image-server) and mirrored through:

```
Interested-Deving-1896/incus-image-server  ──►  OpenOS-Project-OSP/incus-image-server  ──►  OpenOS-Project-Ecosystem-OOC/incus-image-server
```

Changes flow downstream automatically via the hourly mirror chain in
[`fork-sync-all`](https://github.com/Interested-Deving-1896/fork-sync-all).
Direct commits to OSP or OOC are detected and opened as PRs back to `Interested-Deving-1896`.
<!-- AI:end:mirror-chain -->

## Contributors

<!-- AI:start:contributors -->
[@Interested-Deving-1896](https://github.com/Interested-Deving-1896) - 248 commits

*Note: This repository is a mirror. Please refer to the upstream source for additional contributions and updates.*
<!-- AI:end:contributors -->

## Origins

<!-- AI:start:origins -->

Original project — unified simplestreams image server for LXC/LXD/Incus with multi-distro build pipeline.

| Origin | Host | Fork in I-D-1896 |
|--------|------|-----------------|
| [lxc/incus](https://github.com/lxc/incus) | GitHub | ✅ |
| [lxc/distrobuilder](https://github.com/lxc/distrobuilder) | GitHub | ✅ |
<!-- AI:end:origins -->

## Resources

<!-- AI:start:resources -->
| File | Description |
|---|---|
| [dep-graph/origins.md](https://github.com/Interested-Deving-1896/incus-image-server/blob/main/dep-graph/origins.md) | Dependency graph (Markdown table) |
<!-- AI:end:resources -->

## License

<!-- AI:start:license -->
[GPL-3.0](https://github.com/Interested-Deving-1896/incus-image-server/blob/main/LICENSE) © 2026 [Interested-Deving-1896](https://github.com/Interested-Deving-1896)
<!-- AI:end:license -->
