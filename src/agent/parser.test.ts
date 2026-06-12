import { describe, it, expect } from 'vitest';
import { parseAgentOutput } from './parser.js';

describe('parseAgentOutput', () => {
  // ---- navigate ----
  it('parses navigate action', () => {
    const result = parseAgentOutput('{"action":"navigate","resource":"Pod"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toEqual({ action: 'navigate', resource: 'Pod' });
    }
  });

  it('rejects navigate with empty resource', () => {
    const result = parseAgentOutput('{"action":"navigate","resource":""}');
    expect(result.ok).toBe(false);
  });

  it('rejects navigate with missing resource', () => {
    const result = parseAgentOutput('{"action":"navigate"}');
    expect(result.ok).toBe(false);
  });

  // ---- filter ----
  it('parses filter with namespace and search', () => {
    const result = parseAgentOutput(
      '{"action":"filter","namespace":"default","search":"order"}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toEqual({
        action: 'filter',
        namespace: 'default',
        search: 'order',
      });
    }
  });

  it('parses filter with only namespace', () => {
    const result = parseAgentOutput(
      '{"action":"filter","namespace":"staging"}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action.action).toBe('filter');
      const filter = result.action as { action: 'filter'; namespace?: string };
      expect(filter.namespace).toBe('staging');
    }
  });

  it('parses filter with empty fields (no namespace or search)', () => {
    const result = parseAgentOutput('{"action":"filter"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action.action).toBe('filter');
    }
  });

  it('omits empty string namespace from filter', () => {
    const result = parseAgentOutput(
      '{"action":"filter","namespace":"","search":"test"}',
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.action.action === 'filter') {
      expect(result.action.namespace).toBeUndefined();
      expect(result.action.search).toBe('test');
    }
  });

  // ---- answer ----
  it('parses answer action', () => {
    const result = parseAgentOutput('{"action":"answer","text":"Hello world"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toEqual({ action: 'answer', text: 'Hello world' });
    }
  });

  it('parses answer with empty text', () => {
    const result = parseAgentOutput('{"action":"answer","text":""}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action.action).toBe('answer');
    }
  });

  it('rejects answer with missing text', () => {
    const result = parseAgentOutput('{"action":"answer"}');
    expect(result.ok).toBe(false);
  });

  // ---- multi ----
  it('parses multi action', () => {
    const result = parseAgentOutput(
      '{"action":"multi","steps":[{"action":"navigate","resource":"Pod"},{"action":"filter","search":"error"}]}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action.action).toBe('multi');
      const multi = result.action as { action: 'multi'; steps: unknown[] };
      expect(multi.steps).toHaveLength(2);
    }
  });

  it('rejects multi with invalid step', () => {
    const result = parseAgentOutput(
      '{"action":"multi","steps":[{"action":"invalid"}]}',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects multi with non-array steps', () => {
    const result = parseAgentOutput(
      '{"action":"multi","steps":"not-an-array"}',
    );
    expect(result.ok).toBe(false);
  });

  // ---- unknown ----
  it('parses unknown action', () => {
    const result = parseAgentOutput(
      '{"action":"unknown","raw":"I could not understand this"}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toEqual({
        action: 'unknown',
        raw: 'I could not understand this',
      });
    }
  });

  it('rejects unknown without raw', () => {
    const result = parseAgentOutput('{"action":"unknown"}');
    expect(result.ok).toBe(false);
  });

  // ---- JSON extraction ----
  it('extracts JSON from markdown code block', () => {
    const result = parseAgentOutput(
      '```json\n{"action":"navigate","resource":"Pod"}\n```',
    );
    expect(result.ok).toBe(true);
  });

  it('extracts JSON from backtick code block without json marker', () => {
    const result = parseAgentOutput(
      '```\n{"action":"navigate","resource":"Pod"}\n```',
    );
    expect(result.ok).toBe(true);
  });

  it('extracts JSON embedded in surrounding text', () => {
    const result = parseAgentOutput(
      'Here is my answer: {"action":"answer","text":"42"} done.',
    );
    expect(result.ok).toBe(true);
  });

  // ---- Error cases ----
  it('returns failure for empty content', () => {
    const result = parseAgentOutput('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.raw).toBe('');
    }
  });

  it('returns failure for invalid JSON', () => {
    const result = parseAgentOutput('{not valid json}');
    expect(result.ok).toBe(false);
  });

  it('returns failure for JSON without action field', () => {
    const result = parseAgentOutput('{"resource":"Pod"}');
    expect(result.ok).toBe(false);
  });

  it('returns failure for unknown action type', () => {
    const result = parseAgentOutput('{"action":"jump","target":"Pod"}');
    expect(result.ok).toBe(false);
  });

  it('returns failure for non-object JSON', () => {
    const result = parseAgentOutput('"just a string"');
    expect(result.ok).toBe(false);
  });

  it('returns failure for JSON array', () => {
    const result = parseAgentOutput('[]');
    expect(result.ok).toBe(false);
  });

  it('includes raw text in failure result', () => {
    const raw = 'some unparseable text';
    const result = parseAgentOutput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.raw).toBe(raw);
    }
  });

  it('returns failure when JSON has no closing brace', () => {
    const result = parseAgentOutput('{"action":"navigate"');
    expect(result.ok).toBe(false);
  });

  it('returns failure for multi step that is not an object', () => {
    // Step is a number, not a record — exercises isRecord check in validateAction
    const result = parseAgentOutput('{"action":"multi","steps":[42]}');
    expect(result.ok).toBe(false);
  });

  it('returns failure for multi step that is an array', () => {
    // Step is an array, not a record
    const result = parseAgentOutput(
      '{"action":"multi","steps":[[{"action":"navigate","resource":"Pod"}]]}',
    );
    expect(result.ok).toBe(false);
  });
});
