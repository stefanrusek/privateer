#!/bin/bash
# Bring up a local kind cluster inside the Claude Code cloud sandbox so p9r
# has a real kube API to run and test against. Idempotent — safe to re-run.
#
# Companion to scripts/claude-env-setup.sh (the environment Setup script,
# which installs kubectl/kind and pre-pulls the node image into the cached
# Docker store). This script does the per-session part: the environment
# cache stores files, not processes, so dockerd and the cluster must be
# started fresh each session.
#
# Sandbox quirks this script works around (found the hard way):
#   - dockerd is installed but not running
#   - the host is cgroup v1 and leaves the cpuset controller unmounted;
#     kubelet refuses to start without it
#   - the host also lacks the name=systemd named hierarchy; the node's
#     systemd can't mount it itself (EPERM) and PID 1 exits in a loop
#   - kubelet >=1.33 refuses cgroup v1 hosts unless failCgroupV1=false
#   - the sandbox denies writing negative oom_score_adj, which kills the
#     control-plane pods unless containerd clamps via restrict_oom_score_adj
#   - Docker Hub's blob CDN (production.cloudfront.docker.com) is off the
#     network allowlist; pulls inside the node go through mirror.gcr.io
#   - all egress is TLS-intercepted by the sandbox proxy, whose CA must be
#     copied into the node's trust store
#
# After this script, `bun run fixtures:up` works except the registry.k8s.io
# images (metrics-server, kube-state-metrics) — see claude-env-setup.sh for
# the allowlist additions that unblock those.

set -euo pipefail

CLUSTER=p9r
KIND_NODE_IMAGE=mirror.gcr.io/kindest/node:v1.36.1
NODE=${CLUSTER}-control-plane

if ! docker info &>/dev/null; then
  dockerd &>/tmp/dockerd.log &
  timeout 60 bash -c 'until docker info &>/dev/null; do sleep 1; done'
fi

if ! mountpoint -q /sys/fs/cgroup/cpuset 2>/dev/null; then
  mkdir -p /sys/fs/cgroup/cpuset
  mount -t cgroup -o cpuset cgroup /sys/fs/cgroup/cpuset
fi

if ! mountpoint -q /sys/fs/cgroup/systemd 2>/dev/null; then
  mkdir -p /sys/fs/cgroup/systemd
  mount -t cgroup -o none,name=systemd cgroup /sys/fs/cgroup/systemd
fi

if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "kind cluster '$CLUSTER' already exists"
  exit 0
fi

kind create cluster --name "$CLUSTER" --image "$KIND_NODE_IMAGE" --wait 240s --config - <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
kubeadmConfigPatches:
- |
  kind: KubeletConfiguration
  apiVersion: kubelet.config.k8s.io/v1beta1
  failCgroupV1: false
containerdConfigPatches:
- |
  [plugins."io.containerd.cri.v1.runtime"]
    restrict_oom_score_adj = true
  [plugins."io.containerd.cri.v1.images".registry]
    config_path = "/etc/containerd/certs.d"
EOF

docker exec "$NODE" mkdir -p /etc/containerd/certs.d/docker.io
docker exec -i "$NODE" tee /etc/containerd/certs.d/docker.io/hosts.toml >/dev/null <<'EOF'
server = "https://registry-1.docker.io"
[host."https://mirror.gcr.io"]
  capabilities = ["pull", "resolve"]
EOF

docker cp /etc/ssl/certs/ca-certificates.crt "$NODE":/usr/local/share/ca-certificates/sandbox-proxy.crt
docker exec "$NODE" update-ca-certificates >/dev/null
docker exec "$NODE" systemctl restart containerd

echo "kind cluster '$CLUSTER' ready — context kind-$CLUSTER"
