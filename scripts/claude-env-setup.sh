#!/bin/bash
# Claude Code on the web — environment "Setup script" for p9r.
#
# Paste this into the environment's Setup script field
# (claude.ai/code → environment settings). It runs as root on Ubuntu 24.04
# before a session starts, and its results are snapshotted into the
# environment cache, so the installs and the ~1GB node image pull happen
# once, not per session.
#
# What it does:
#   - installs kubectl and kind
#   - pre-pulls the kind node image into /var/lib/docker (cached)
#
# Per-session work (dockerd, cluster creation) lives in
# scripts/claude-cluster-up.sh — the cache stores files, not processes.
#
# Network notes (default "Trusted" allowlist):
#   - Docker Hub pulls fail: blobs come from production.cloudfront.docker.com,
#     which is NOT allowlisted (the list has the older cloudflare CDN host).
#     Everything here pulls through mirror.gcr.io instead (*.gcr.io is allowed).
#   - registry.k8s.io is NOT allowlisted (403). The metrics-server and
#     kube-state-metrics fixtures need it; to use them, set the environment's
#     network access to Custom and add: registry.k8s.io and *.pkg.dev

set -u

KIND_VERSION=v0.32.0
KIND_NODE_IMAGE=mirror.gcr.io/kindest/node:v1.36.1

curl -fsSLo /usr/local/bin/kubectl \
  "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
  && chmod +x /usr/local/bin/kubectl || true

curl -fsSLo /usr/local/bin/kind \
  "https://github.com/kubernetes-sigs/kind/releases/download/${KIND_VERSION}/kind-linux-amd64" \
  && chmod +x /usr/local/bin/kind || true

# Pre-pull the kind node image so per-session cluster creation is fast.
if ! docker info &>/dev/null; then
  dockerd &>/var/log/dockerd-setup.log &
  timeout 60 bash -c 'until docker info &>/dev/null; do sleep 1; done' || true
fi
docker pull "$KIND_NODE_IMAGE" || true
