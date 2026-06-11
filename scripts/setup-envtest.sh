#!/usr/bin/env bash
# Spec 08 §5.3 — fetch the pinned envtest control-plane binaries (etcd,
# kube-apiserver, kubectl) via setup-envtest and print the KUBEBUILDER_ASSETS
# path. The Kubernetes version is pinned here and in test/envtest/version.ts.
#
# Usage:
#   eval "$(scripts/setup-envtest.sh)"   # exports KUBEBUILDER_ASSETS
# Requires: go (for `go install`) — only the first time, to obtain setup-envtest.
set -euo pipefail

ENVTEST_K8S_VERSION="${ENVTEST_K8S_VERSION:-1.31.0}"
BIN_DIR="${ENVTEST_BIN_DIR:-$HOME/.local/share/kubebuilder-envtest}"

# Locate setup-envtest, installing it on first use.
SETUP_ENVTEST="$(command -v setup-envtest || true)"
if [ -z "$SETUP_ENVTEST" ] && [ -x "$HOME/go/bin/setup-envtest" ]; then
  SETUP_ENVTEST="$HOME/go/bin/setup-envtest"
fi
if [ -z "$SETUP_ENVTEST" ]; then
  echo "installing setup-envtest..." >&2
  GOBIN="$HOME/go/bin" go install sigs.k8s.io/controller-runtime/tools/setup-envtest@latest >&2
  SETUP_ENVTEST="$HOME/go/bin/setup-envtest"
fi

ASSETS="$("$SETUP_ENVTEST" use "$ENVTEST_K8S_VERSION" --bin-dir "$BIN_DIR" -p path)"
echo "export KUBEBUILDER_ASSETS=\"$ASSETS\""
