/**
 * --no-agent mode (Spec 07 §11.4).
 *
 * When launched with `--no-agent`:
 *  - the command bar is command-only — the leading `!` is implied/optional;
 *  - the AgentTab is hidden from the detail pane;
 *  - `Space` opens the command bar directly in command-only mode.
 *
 * Pure helpers — no I/O — so the behaviour switch is exhaustively table-tested.
 */

/** The CLI flag that disables the agent. */
export const NO_AGENT_FLAG = '--no-agent';

/** Command-bar hint shown in no-agent mode (Spec 07 §11.4). */
export const NO_AGENT_COMMAND_BAR_HINT = '·  !command';

/**
 * Resolve whether the agent is enabled from raw CLI arguments. Disabled iff
 * `--no-agent` appears anywhere in `argv`.
 */
export function isAgentEnabled(argv: readonly string[]): boolean {
  return !argv.includes(NO_AGENT_FLAG);
}

/** AgentTab is visible only when the agent is enabled. */
export function agentTabVisible(agentEnabled: boolean): boolean {
  return agentEnabled;
}

/** The command bar is command-only exactly when the agent is disabled. */
export function commandBarIsCommandOnly(agentEnabled: boolean): boolean {
  return !agentEnabled;
}

/**
 * The command-bar mode opened by `Space`. In normal mode `Space` does nothing
 * special for the agent path here, but in no-agent mode it opens the bar
 * directly in `command` mode (Spec 07 §11.4).
 */
export function spaceOpensMode(agentEnabled: boolean): 'command' | 'agent' {
  return agentEnabled ? 'agent' : 'command';
}

/**
 * Normalize an input typed in no-agent command-only mode: the `!` prefix is
 * optional, so strip a single leading `!` if present, then trim. The result is
 * the bare command text (empty string for blank input).
 */
export function normalizeNoAgentInput(input: string): string {
  const trimmed = input.trim();
  const withoutBang = trimmed.startsWith('!') ? trimmed.slice(1) : trimmed;
  return withoutBang.trim();
}
