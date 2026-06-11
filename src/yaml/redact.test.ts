import { describe, it, expect } from 'vitest';
import { redactSecret } from './redact.js';
import jsYaml from 'js-yaml';

describe('redactSecret', () => {
  it('redacts data values in a Secret', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  password: c2VjcmV0
  username: dXNlcg==
`;
    const result = redactSecret(yaml);
    expect(result).toContain('[redacted]');
    expect(result).not.toContain('c2VjcmV0');
    expect(result).not.toContain('dXNlcg==');
    // Keys should still be present
    expect(result).toContain('password');
    expect(result).toContain('username');
  });

  it('redacts stringData values in a Secret', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
stringData:
  token: my-super-secret-token
  apiKey: another-secret
`;
    const result = redactSecret(yaml);
    expect(result).toContain('[redacted]');
    expect(result).not.toContain('my-super-secret-token');
    expect(result).not.toContain('another-secret');
    expect(result).toContain('token');
    expect(result).toContain('apiKey');
  });

  it('redacts both data and stringData when both are present', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  encoded: dXNlcg==
stringData:
  plain: plaintext
`;
    const result = redactSecret(yaml);
    expect(result).not.toContain('dXNlcg==');
    expect(result).not.toContain('plaintext');
    expect(result).toContain('[redacted]');
  });

  it('does not redact ConfigMap', () => {
    const yaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  host: localhost
  port: "8080"
`;
    const result = redactSecret(yaml);
    expect(result).toContain('localhost');
    expect(result).toContain('8080');
    expect(result).not.toContain('[redacted]');
  });

  it('does not redact Deployment', () => {
    const yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
`;
    const result = redactSecret(yaml);
    expect(result).not.toContain('[redacted]');
  });

  it('returns original if YAML is invalid', () => {
    const invalid = ': invalid: yaml: [[[';
    const result = redactSecret(invalid);
    expect(result).toBe(invalid);
  });

  it('handles Secret with no data or stringData fields', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: empty-secret
`;
    const result = redactSecret(yaml);
    // Should not throw, should return valid YAML
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    expect(parsed.kind).toBe('Secret');
  });

  it('handles Secret with empty data object', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: empty-secret
data: {}
`;
    const result = redactSecret(yaml);
    expect(result).not.toContain('[redacted]');
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    expect(parsed.kind).toBe('Secret');
  });

  it('handles non-object YAML gracefully', () => {
    const yaml = '42';
    const result = redactSecret(yaml);
    expect(result).toBe(yaml);
  });

  it('handles null YAML document gracefully', () => {
    const yaml = 'null';
    const result = redactSecret(yaml);
    expect(result).toBe(yaml);
  });

  it('preserves Secret metadata and other fields after redaction', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: default
type: Opaque
data:
  key: dmFsdWU=
`;
    const result = redactSecret(yaml);
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    const meta = parsed.metadata as Record<string, unknown>;
    expect(meta.name).toBe('my-secret');
    expect(meta.namespace).toBe('default');
    expect(parsed.type).toBe('Opaque');
    const data = parsed.data as Record<string, string>;
    expect(data.key).toBe('[redacted]');
  });
});
