import { describe, it, expect } from 'vitest';
import { shouldThink } from './thinking-policy.js';

// ---------------------------------------------------------------------------
// Table-driven: navigation/filter → off, diagnostic → on.
// ---------------------------------------------------------------------------

const CASES: readonly (readonly [query: string, expected: boolean])[] = [
  // Navigation / filter intents → thinking OFF
  ['show pods', false],
  ['go to deployments', false],
  ['open services', false],
  ['pods in default', false],
  ['svc', false],
  ['list jobs', false],
  ['get nodes', false],
  ['filter staging', false],
  ['switch context prod', false],
  ['navigate secrets', false],

  // Diagnostic "what's wrong" intents → thinking ON
  ["what's wrong with the order-api pod", true],
  ['why is the deployment failing', true],
  ['how is the cluster doing', true],
  ['which pods are crashing', true],
  ['diagnose the cluster', true],
  ['anything broken?', true],
  ['show me the failing pods', true],
  ['errors in default', true],
  ['the api is unhealthy', true],
  ['the rollout is degraded', true],
  ['investigate the outage', true],
  ['explain the crashloop', true],
  ['what is the cause', true],
  ['what is the reason for this', true],
  ['error', true],

  // Edge cases
  ['', false],
  ['   ', false],
  ['hello world', false],
  ['SHOW PODS', false],
  ['WHY IS IT BROKEN', true],
];

describe('shouldThink', () => {
  for (const [query, expected] of CASES) {
    it(`${expected ? 'enables' : 'disables'} thinking for "${query}"`, () => {
      expect(shouldThink(query)).toBe(expected);
    });
  }
});
