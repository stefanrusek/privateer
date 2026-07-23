import { describe, expect, it } from 'vitest';
import jsYaml from 'js-yaml';
import { hasManagedFields, hideManagedFields } from './managed-fields.js';

const WITH_MANAGED = jsYaml.dump({
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: {
    name: 'cfg',
    managedFields: [{ manager: 'kubectl', operation: 'Update' }],
  },
  data: { key: 'value' },
});

const WITHOUT_MANAGED = jsYaml.dump({
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: { name: 'cfg' },
  data: { key: 'value' },
});

describe('hasManagedFields', () => {
  it('is true when metadata.managedFields is present', () => {
    expect(hasManagedFields(WITH_MANAGED)).toBe(true);
  });

  it('is false when metadata.managedFields is absent', () => {
    expect(hasManagedFields(WITHOUT_MANAGED)).toBe(false);
  });

  it('is false for invalid YAML', () => {
    expect(hasManagedFields(': invalid: yaml: [[[')).toBe(false);
  });

  it('is false when the document is not an object', () => {
    expect(hasManagedFields('- 1\n- 2\n')).toBe(false);
    expect(hasManagedFields('5')).toBe(false);
  });

  it('is false when metadata is missing or not an object', () => {
    expect(hasManagedFields(jsYaml.dump({ kind: 'Pod' }))).toBe(false);
    expect(hasManagedFields(jsYaml.dump({ kind: 'Pod', metadata: 5 }))).toBe(
      false,
    );
    expect(
      hasManagedFields(jsYaml.dump({ kind: 'Pod', metadata: [1, 2] })),
    ).toBe(false);
  });
});

describe('hideManagedFields', () => {
  it('removes metadata.managedFields, preserving other keys', () => {
    const result = hideManagedFields(WITH_MANAGED);
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    const meta = parsed.metadata as Record<string, unknown>;
    expect(meta.managedFields).toBeUndefined();
    expect(meta.name).toBe('cfg');
    expect(parsed.data).toEqual({ key: 'value' });
  });

  it('returns the original string unchanged when there is nothing to strip', () => {
    expect(hideManagedFields(WITHOUT_MANAGED)).toBe(WITHOUT_MANAGED);
  });

  it('returns the original string unchanged for invalid YAML', () => {
    const invalid = ': invalid: yaml: [[[';
    expect(hideManagedFields(invalid)).toBe(invalid);
  });

  it('returns the original string unchanged when the document is not an object', () => {
    expect(hideManagedFields('- 1\n- 2\n')).toBe('- 1\n- 2\n');
  });

  it('returns the original string unchanged when metadata is missing or not an object', () => {
    const noMeta = jsYaml.dump({ kind: 'Pod' });
    expect(hideManagedFields(noMeta)).toBe(noMeta);
    const badMeta = jsYaml.dump({ kind: 'Pod', metadata: 5 });
    expect(hideManagedFields(badMeta)).toBe(badMeta);
  });
});
