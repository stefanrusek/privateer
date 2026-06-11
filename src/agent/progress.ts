/**
 * Progress display strings for tool calls (Spec 07 §10.2).
 *
 * Humanizes tool names and parameters into display strings shown in the
 * command bar while the model is calling tools.
 */

/**
 * Return a humanized display string for a tool call in progress.
 * Spec 07 §10.2 — shown in command bar while model is calling tools.
 */
export function humanizeToolCall(
  toolName: string,
  params: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'list_resources': {
      const kind = typeof params.kind === 'string' ? params.kind : 'resources';
      return `looking up ${kind}s…`;
    }
    case 'get_resource': {
      const name = typeof params.name === 'string' ? params.name : 'resource';
      return `inspecting ${name}…`;
    }
    case 'find_erroring_pods':
      return 'finding erroring pods…';
    case 'get_deployment_detail': {
      const name = typeof params.name === 'string' ? params.name : 'deployment';
      return `checking ${name} deployment…`;
    }
    case 'get_kafka_lag':
      return 'checking consumer lag…';
    case 'get_events':
      return 'reading events…';
    case 'count_resources': {
      const kind = typeof params.kind === 'string' ? params.kind : 'resources';
      return `counting ${kind}s…`;
    }
    case 'get_pod_detail': {
      const name = typeof params.name === 'string' ? params.name : 'pod';
      return `inspecting pod ${name}…`;
    }
    case 'get_rollout_status': {
      const name = typeof params.name === 'string' ? params.name : 'deployment';
      return `checking ${name} rollout…`;
    }
    default:
      return `calling ${toolName}…`;
  }
}
