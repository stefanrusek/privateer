/**
 * Agent eval harness (NON-GATING, lives outside src/ so it is never part of the
 * coverage-gated unit suite).
 *
 * It checks the deterministic fast-path parser against a fixture set of
 * (query, clusterSummary) -> expectedAction pairs and reports a pass-rate. This
 * is the cheap, model-free slice of the eval surface; the full model evals run
 * against a downloaded Gemma model out of band.
 *
 * HOW TO RUN:
 *
 *   export PATH="$HOME/.bun/bin:$PATH"
 *   bun evals/run.ts
 *
 * Exit code is 0 regardless of pass-rate — these evals are informational and
 * MUST NOT gate CI. Read the printed pass-rate to judge regressions.
 */

import { parseFastPath } from '../src/command/fast-path.js';
import type { AgentAction } from '../src/command/action.js';

interface ClusterSummary {
  readonly namespaces: readonly string[];
}

interface EvalCase {
  readonly query: string;
  readonly cluster: ClusterSummary;
  readonly expected: AgentAction | null;
}

const FIXTURES: readonly EvalCase[] = [
  {
    query: 'show pods',
    cluster: { namespaces: ['default'] },
    expected: { action: 'navigate', resource: 'Pod' },
  },
  {
    query: 'go to deployments',
    cluster: { namespaces: ['default'] },
    expected: { action: 'navigate', resource: 'Deployment' },
  },
  {
    query: 'pods in kube-system',
    cluster: { namespaces: ['default', 'kube-system'] },
    expected: {
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', namespace: 'kube-system' },
      ],
    },
  },
  {
    query: 'erroring pods',
    cluster: { namespaces: ['default'] },
    expected: {
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    },
  },
  {
    query: 'kube-system',
    cluster: { namespaces: ['default', 'kube-system'] },
    expected: { action: 'filter', namespace: 'kube-system' },
  },
  {
    // Question words fall through to the model — fast path returns null.
    query: 'why is the order-api pod crashing',
    cluster: { namespaces: ['default'] },
    expected: null,
  },
  {
    query: 'how many deployments are there',
    cluster: { namespaces: ['default'] },
    expected: null,
  },
];

function run(): void {
  let passed = 0;
  const failures: string[] = [];

  for (const c of FIXTURES) {
    const actual = parseFastPath(c.query, new Set(c.cluster.namespaces));
    const ok = JSON.stringify(actual) === JSON.stringify(c.expected);
    if (ok) {
      passed += 1;
    } else {
      failures.push(
        `  ✗ "${c.query}"\n      expected: ${JSON.stringify(c.expected)}\n      actual:   ${JSON.stringify(actual)}`,
      );
    }
  }

  const total = FIXTURES.length;
  const rate = total === 0 ? 100 : Math.round((passed / total) * 100);
  process.stdout.write(
    `Agent fast-path evals: ${String(passed)}/${String(total)} passed (${String(rate)}%)\n`,
  );
  if (failures.length > 0) {
    process.stdout.write(`${failures.join('\n')}\n`);
  }
}

run();
