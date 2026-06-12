/**
 * Smoke test for the re-export barrel.
 * Ensures all symbols from src/yaml/index.ts are accessible and the module
 * is loaded (which counts toward coverage for the barrel file).
 */
import { describe, it, expect } from 'vitest';
import {
  tokenizeLine,
  redactSecret,
  computeDiff,
  createEditBuffer,
  EditBufferHandle,
  validateYaml,
} from './index.js';

describe('src/yaml/index re-exports', () => {
  it('exports tokenizeLine', () => {
    const tokens = tokenizeLine('key: value');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('exports redactSecret', () => {
    const yaml = 'kind: ConfigMap\ndata:\n  key: val\n';
    expect(redactSecret(yaml)).toContain('val');
  });

  it('exports computeDiff', () => {
    const diff = computeDiff('a: 1\n', 'a: 2\n');
    expect(diff.length).toBeGreaterThan(0);
  });

  it('exports createEditBuffer and EditBufferHandle', () => {
    const buf = createEditBuffer('line1\n');
    expect(buf).toBeInstanceOf(EditBufferHandle);
  });

  it('exports validateYaml', () => {
    expect(validateYaml('key: value')).toBeNull();
  });
});
