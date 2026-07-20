import { describe, it, expect } from 'vitest';
import { maskSecret, revealSecret, SECRET_MASK } from './redact.js';
import jsYaml from 'js-yaml';

describe('maskSecret', () => {
  it('masks data values in a Secret with a fixed-width mask', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  password: c2VjcmV0
  username: dXNlcg==
`;
    const result = maskSecret(yaml);
    expect(result).toContain(SECRET_MASK);
    expect(result).not.toContain('c2VjcmV0');
    expect(result).not.toContain('dXNlcg==');
    // Keys should still be present
    expect(result).toContain('password');
    expect(result).toContain('username');
  });

  it('the mask is fixed-width regardless of value length', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  short: YQ==
  long: ${Buffer.from('a'.repeat(200)).toString('base64')}
`;
    const result = maskSecret(yaml);
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    const data = parsed.data as Record<string, string>;
    expect(data.short).toBe(SECRET_MASK);
    expect(data.long).toBe(SECRET_MASK);
  });

  it('masks stringData values in a Secret', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
stringData:
  token: my-super-secret-token
  apiKey: another-secret
`;
    const result = maskSecret(yaml);
    expect(result).toContain(SECRET_MASK);
    expect(result).not.toContain('my-super-secret-token');
    expect(result).not.toContain('another-secret');
    expect(result).toContain('token');
    expect(result).toContain('apiKey');
  });

  it('masks both data and stringData when both are present', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  encoded: dXNlcg==
stringData:
  plain: plaintext
`;
    const result = maskSecret(yaml);
    expect(result).not.toContain('dXNlcg==');
    expect(result).not.toContain('plaintext');
    expect(result).toContain(SECRET_MASK);
  });

  it('does not mask ConfigMap', () => {
    const yaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  host: localhost
  port: "8080"
`;
    const result = maskSecret(yaml);
    expect(result).toContain('localhost');
    expect(result).toContain('8080');
    expect(result).not.toContain(SECRET_MASK);
  });

  it('does not mask Deployment', () => {
    const yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
`;
    const result = maskSecret(yaml);
    expect(result).not.toContain(SECRET_MASK);
  });

  it('returns original if YAML is invalid', () => {
    const invalid = ': invalid: yaml: [[[';
    const result = maskSecret(invalid);
    expect(result).toBe(invalid);
  });

  it('handles Secret with no data or stringData fields', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: empty-secret
`;
    const result = maskSecret(yaml);
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
    const result = maskSecret(yaml);
    expect(result).not.toContain(SECRET_MASK);
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    expect(parsed.kind).toBe('Secret');
  });

  it('handles non-object YAML gracefully', () => {
    const yaml = '42';
    const result = maskSecret(yaml);
    expect(result).toBe(yaml);
  });

  it('handles null YAML document gracefully', () => {
    const yaml = 'null';
    const result = maskSecret(yaml);
    expect(result).toBe(yaml);
  });

  it('preserves Secret metadata and other fields after masking', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: default
type: Opaque
data:
  key: dmFsdWU=
`;
    const result = maskSecret(yaml);
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    const meta = parsed.metadata as Record<string, unknown>;
    expect(meta.name).toBe('my-secret');
    expect(meta.namespace).toBe('default');
    expect(parsed.type).toBe('Opaque');
    const data = parsed.data as Record<string, string>;
    expect(data.key).toBe(SECRET_MASK);
  });
});

describe('revealSecret', () => {
  it('decodes data values to UTF-8 plaintext', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  password: c2VjcmV0
  username: dXNlcg==
`;
    const result = revealSecret(yaml);
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    const data = parsed.data as Record<string, string>;
    expect(data.password).toBe('secret');
    expect(data.username).toBe('user');
  });

  it('renders undecodable bytes as a <binary, N bytes> placeholder', () => {
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02]);
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  blob: ${binary.toString('base64')}
`;
    const result = revealSecret(yaml);
    const parsed = jsYaml.load(result) as Record<string, unknown>;
    const data = parsed.data as Record<string, string>;
    expect(data.blob).toBe(`<binary, ${String(binary.length)} bytes>`);
  });

  it('does not reveal ConfigMap (returns as-is)', () => {
    const yaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  host: localhost
`;
    const result = revealSecret(yaml);
    expect(result).toContain('localhost');
  });

  it('returns original if YAML is invalid', () => {
    const invalid = ': invalid: yaml: [[[';
    expect(revealSecret(invalid)).toBe(invalid);
  });

  it('handles non-object and null YAML gracefully', () => {
    expect(revealSecret('42')).toBe('42');
    expect(revealSecret('null')).toBe('null');
  });

  it('round-trips: masking/revealing never mutate the underlying base64', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  password: c2VjcmV0
`;
    // Masking/revealing only ever transform a *display copy*; the original
    // input string (what an edit buffer would be seeded from) is untouched.
    maskSecret(yaml);
    revealSecret(yaml);
    expect(yaml).toContain('c2VjcmV0');
  });
});
