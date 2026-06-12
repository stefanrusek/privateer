/**
 * Prompt builder for the agent layer (Spec 07 §3).
 *
 * Produces a compact system prompt (<2000 tokens) containing a cluster state
 * snapshot: workload health summary, namespace list (top 10 by pod count),
 * top 5 health issues, optional Kafka summary, and available resource kinds.
 */

import type { StateStore } from '../store/state-store.js';
import type { ToolDefinition } from '../boundaries/inference-engine.js';

// ---------------------------------------------------------------------------
// Inputs to the prompt builder
// ---------------------------------------------------------------------------

export interface HealthIssue {
  severity: 'error' | 'warn' | 'info';
  title: string;
}

export interface KafkaClusterSummary {
  clusterName: string;
  brokerCount: number;
  topicCount: number;
  lagSummary: string;
}

export interface PromptContext {
  activeContext: string;
  activeNamespace: string | null;
  activeResourceKind: string;
  healthIssues: readonly HealthIssue[];
  kafkaClusters: readonly KafkaClusterSummary[];
  allResourceKinds: readonly string[];
}

// ---------------------------------------------------------------------------
// Build system prompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(
  ctx: PromptContext,
  store: StateStore,
): string {
  const ns = ctx.activeNamespace;
  const nsDisplay = ns !== null && ns.length > 0 ? ns : 'all namespaces';
  const contextName = ctx.activeContext;

  // ---- Workload health summary ----
  const pods = store.list(contextName, 'Pod');
  let podRunning = 0;
  let podWarning = 0;
  let podError = 0;
  let podPending = 0;

  for (const pod of pods) {
    switch (pod.status.color) {
      case 'green':
        podRunning++;
        break;
      case 'yellow':
        podWarning++;
        break;
      case 'red':
        podError++;
        break;
      case 'grey':
        podPending++;
        break;
    }
  }

  const deployments = store.list(contextName, 'Deployment');
  let deployHealthy = 0;
  let deployDegraded = 0;
  for (const d of deployments) {
    if (d.status.color === 'green') {
      deployHealthy++;
    } else if (d.status.color === 'red' || d.status.color === 'yellow') {
      deployDegraded++;
    }
  }

  const statefulSets = store.list(contextName, 'StatefulSet');
  let stsHealthy = 0;
  let stsDegraded = 0;
  for (const s of statefulSets) {
    if (s.status.color === 'green') {
      stsHealthy++;
    } else if (s.status.color === 'red' || s.status.color === 'yellow') {
      stsDegraded++;
    }
  }

  // ---- Namespace list (top 10 by pod count) ----
  const nsPodCount = new Map<string, number>();
  for (const pod of pods) {
    const podNs = pod.namespace ?? '~';
    nsPodCount.set(podNs, (nsPodCount.get(podNs) ?? 0) + 1);
  }

  // Count errors per namespace
  const nsErrorCount = new Map<string, number>();
  for (const pod of pods) {
    if (pod.status.color === 'red') {
      const podNs = pod.namespace ?? '~';
      nsErrorCount.set(podNs, (nsErrorCount.get(podNs) ?? 0) + 1);
    }
  }

  const allNamespaces = store.list(contextName, 'Namespace');
  const nsSet = new Set<string>(allNamespaces.map((n) => n.name));
  // Also include namespaces from pods in case Namespace resources aren't present
  for (const podNs of nsPodCount.keys()) {
    nsSet.add(podNs);
  }

  const nsSorted = [...nsSet]
    .map((name) => ({ name, podCount: nsPodCount.get(name) ?? 0 }))
    .sort((a, b) => b.podCount - a.podCount);

  const TOP_NS = 10;
  const topNamespaces = nsSorted.slice(0, TOP_NS);
  const remainingNs = nsSorted.length - TOP_NS;

  const nsLines = topNamespaces
    .map((ns_) => {
      const errors = nsErrorCount.get(ns_.name) ?? 0;
      const errPart = errors > 0 ? `, ${String(errors)} errors` : '';
      return `- ${ns_.name}: ${String(ns_.podCount)} pods${errPart}`;
    })
    .join('\n');

  const nsSection =
    remainingNs > 0 ? `${nsLines}\n- and ${String(remainingNs)} more` : nsLines;

  // ---- Health issues (top 5 by severity) ----
  const TOP_ISSUES = 5;
  const severityOrder: Record<string, number> = { error: 0, warn: 1, info: 2 };
  const sortedIssues = [...ctx.healthIssues]
    .sort(
      (a, b) =>
        (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2),
    )
    .slice(0, TOP_ISSUES);

  const issueLines =
    sortedIssues.length > 0
      ? sortedIssues
          .map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.title}`)
          .join('\n')
      : '- None';

  // ---- Kafka (if detected) ----
  let kafkaSection = '';
  if (ctx.kafkaClusters.length > 0) {
    const kafkaLines = ctx.kafkaClusters
      .map(
        (kc) =>
          `${kc.clusterName}: ${String(kc.brokerCount)} brokers, ${String(kc.topicCount)} topics\n` +
          `Consumer groups with lag > threshold: ${kc.lagSummary}`,
      )
      .join('\n');
    kafkaSection = `\n### Kafka (if detected)\n${kafkaLines}\n`;
  }

  // ---- Available resource types ----
  const resourceKinds = ctx.allResourceKinds.join(', ');

  return `You are Privateer, a Kubernetes cluster assistant embedded in a TUI.
You help users navigate, inspect, and understand their cluster.

You have access to tools to inspect cluster state. Use them to answer
questions accurately. Do not guess resource names or states.

When you have enough information, respond with a JSON action object.
Never respond with free text — always respond with a JSON action.

## Current cluster state summary

Context: ${ctx.activeContext}
Namespace filter: ${nsDisplay}
Active view: ${ctx.activeResourceKind}

### Workload health
- Pods: ${String(podRunning)} running, ${String(podWarning)} warning, ${String(podError)} error, ${String(podPending)} pending
- Deployments: ${String(deployHealthy)} healthy, ${String(deployDegraded)} degraded
- StatefulSets: ${String(stsHealthy)} healthy, ${String(stsDegraded)} degraded

### Namespaces
${nsSection}

### Active health issues
${issueLines}
${kafkaSection}
## Available resource types
${resourceKinds}

## Response format
Always respond with a valid JSON object matching one of these schemas:
{"action":"navigate","resource":"<kind>"}
{"action":"filter","namespace":"<ns>","search":"<term>"}
{"action":"answer","text":"<answer, max ~80 words; bullet lines allowed>"}
{"action":"multi","steps":[<array of above actions>]}
{"action":"unknown","raw":"<what you understood"}`;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function buildToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'list_resources',
      description:
        'List Kubernetes resources of a given kind. Use this to find resources by name, namespace, or status.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'e.g. "Pod", "Deployment"' },
          namespace: {
            type: 'string',
            description: 'omit for all namespaces',
          },
          status: {
            type: 'string',
            enum: ['error', 'warning', 'healthy', 'unknown'],
          },
          search: {
            type: 'string',
            description: 'substring match on name',
          },
          limit: {
            type: 'number',
            description: 'default 20, max 50',
          },
        },
        required: ['kind'],
      },
    },
    {
      name: 'get_resource',
      description:
        'Get full details of a specific Kubernetes resource including spec and status.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          name: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['kind', 'name'],
      },
    },
    {
      name: 'get_events',
      description:
        'Get recent Kubernetes events for a resource or namespace. Useful for diagnosing errors.',
      parameters: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          resourceKind: { type: 'string' },
          resourceName: { type: 'string' },
          type: { type: 'string', enum: ['Warning', 'Normal'] },
          limit: { type: 'number' },
        },
        required: [],
      },
    },
    {
      name: 'count_resources',
      description:
        "Count resources by kind and optionally by status or namespace. Use for questions like 'how many pods are crashing'.",
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          namespace: { type: 'string' },
          status: {
            type: 'string',
            enum: ['error', 'warning', 'healthy', 'unknown'],
          },
        },
        required: ['kind'],
      },
    },
    {
      name: 'get_pod_detail',
      description:
        'Get detailed information about a specific pod including all container states, resource usage, restart history, and owner references.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['name', 'namespace'],
      },
    },
    {
      name: 'find_erroring_pods',
      description:
        'Find all pods currently in an error state with a triage summary.',
      parameters: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'omit for all namespaces' },
        },
        required: [],
      },
    },
    {
      name: 'get_deployment_detail',
      description:
        'Get detailed information about a deployment including rollout status, pod health summary, HPA configuration, and recent events.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['name', 'namespace'],
      },
    },
    {
      name: 'get_rollout_status',
      description:
        'Check the rollout status of a deployment. Useful for determining if a deployment is progressing, complete, or stuck.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['name', 'namespace'],
      },
    },
    {
      name: 'get_kafka_lag',
      description:
        'Get consumer group lag for Kafka topics. Use for questions about message backlog, slow consumers, or lag trends.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'omit for all topics' },
          consumerGroup: {
            type: 'string',
            description: 'omit for all groups',
          },
        },
        required: [],
      },
    },
  ];
}
