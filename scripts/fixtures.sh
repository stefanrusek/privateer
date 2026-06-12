#!/usr/bin/env bash
# p9r cluster fixtures — reproducible test environment.
#
#   bun run fixtures:up          # workloads + metrics-server + prometheus
#   bun run fixtures:up kafka    # ... plus Strimzi Kafka (heavier, opt-in)
#   bun run fixtures:down        # remove everything (incl. kafka if present)
set -euo pipefail
cd "$(dirname "$0")/.."

STRIMZI_VERSION=1.0.0
STRIMZI_URL="https://github.com/strimzi/strimzi-kafka-operator/releases/download/${STRIMZI_VERSION}/strimzi-cluster-operator-${STRIMZI_VERSION}.yaml"

cmd=${1:-up}
opt=${2:-}

up() {
  kubectl apply -f fixtures/00-workloads.yaml
  kubectl apply -f fixtures/10-metrics-server.yaml
  kubectl apply -f fixtures/20-prometheus.yaml

  if [[ "$opt" == "kafka" ]]; then
    kubectl create namespace kafka --dry-run=client -o yaml | kubectl apply -f -
    echo "Installing Strimzi operator ${STRIMZI_VERSION}…"
    curl -sL "$STRIMZI_URL" | sed "s/namespace: .*/namespace: kafka/" \
      | kubectl apply -n kafka -f -
    echo "Waiting for the Strimzi operator…"
    kubectl -n kafka wait deployment/strimzi-cluster-operator \
      --for=condition=Available --timeout=300s
    kubectl apply -f fixtures/30-kafka.yaml
    echo "Kafka CR applied — broker takes a few minutes to start."
  fi

  echo
  echo "Fixtures applied. Watch readiness with:"
  echo "  kubectl get pods -A"
}

down() {
  kubectl delete -f fixtures/30-kafka.yaml --ignore-not-found 2>/dev/null || true
  if kubectl get namespace kafka >/dev/null 2>&1; then
    curl -sL "$STRIMZI_URL" | sed "s/namespace: .*/namespace: kafka/" \
      | kubectl delete -n kafka --ignore-not-found -f - 2>/dev/null || true
    kubectl delete namespace kafka --ignore-not-found
  fi
  kubectl delete -f fixtures/20-prometheus.yaml --ignore-not-found
  kubectl delete -f fixtures/10-metrics-server.yaml --ignore-not-found
  kubectl delete -f fixtures/00-workloads.yaml --ignore-not-found
}

case "$cmd" in
  up) up ;;
  down) down ;;
  *)
    echo "usage: fixtures.sh up [kafka] | down" >&2
    exit 1
    ;;
esac
