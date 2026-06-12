import { describe, it, expect } from 'vitest';
import { humanizeToolCall } from './progress.js';

describe('humanizeToolCall', () => {
  it('humanizes list_resources with kind', () => {
    expect(humanizeToolCall('list_resources', { kind: 'Pod' })).toBe(
      'looking up Pods…',
    );
  });

  it('humanizes list_resources without kind', () => {
    expect(humanizeToolCall('list_resources', {})).toBe(
      'looking up resourcess…',
    );
  });

  it('humanizes get_resource with name', () => {
    expect(humanizeToolCall('get_resource', { name: 'order-api' })).toBe(
      'inspecting order-api…',
    );
  });

  it('humanizes get_resource without name', () => {
    expect(humanizeToolCall('get_resource', {})).toBe('inspecting resource…');
  });

  it('humanizes find_erroring_pods', () => {
    expect(humanizeToolCall('find_erroring_pods', {})).toBe(
      'finding erroring pods…',
    );
  });

  it('humanizes get_deployment_detail with name', () => {
    expect(
      humanizeToolCall('get_deployment_detail', { name: 'order-api' }),
    ).toBe('checking order-api deployment…');
  });

  it('humanizes get_deployment_detail without name', () => {
    expect(humanizeToolCall('get_deployment_detail', {})).toBe(
      'checking deployment deployment…',
    );
  });

  it('humanizes get_kafka_lag', () => {
    expect(humanizeToolCall('get_kafka_lag', {})).toBe(
      'checking consumer lag…',
    );
  });

  it('humanizes get_events', () => {
    expect(humanizeToolCall('get_events', {})).toBe('reading events…');
  });

  it('humanizes count_resources with kind', () => {
    expect(humanizeToolCall('count_resources', { kind: 'Deployment' })).toBe(
      'counting Deployments…',
    );
  });

  it('humanizes count_resources without kind', () => {
    expect(humanizeToolCall('count_resources', {})).toBe(
      'counting resourcess…',
    );
  });

  it('humanizes get_pod_detail with name', () => {
    expect(humanizeToolCall('get_pod_detail', { name: 'pod-abc' })).toBe(
      'inspecting pod pod-abc…',
    );
  });

  it('humanizes get_pod_detail without name', () => {
    expect(humanizeToolCall('get_pod_detail', {})).toBe('inspecting pod pod…');
  });

  it('humanizes get_rollout_status with name', () => {
    expect(humanizeToolCall('get_rollout_status', { name: 'order-api' })).toBe(
      'checking order-api rollout…',
    );
  });

  it('humanizes get_rollout_status without name', () => {
    expect(humanizeToolCall('get_rollout_status', {})).toBe(
      'checking deployment rollout…',
    );
  });

  it('humanizes unknown tool name', () => {
    expect(humanizeToolCall('mystery_tool', {})).toBe('calling mystery_tool…');
  });
});
