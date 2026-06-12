/**
 * Bang-command parser for the command bar.
 *
 * Spec 02 §7.4 — parses !ctx, !ns <name>, !q/!quit, !<resource>
 * into typed command results. Shares the alias dictionary with fast-path.
 */

import type { AgentAction } from './action.js';
import { resolveKind } from './aliases.js';

// ---------------------------------------------------------------------------
// Command result type
// ---------------------------------------------------------------------------

/** Context-switcher command */
export interface CtxCommand {
  kind: 'ctx';
}

/** Namespace-switch command */
export interface NsCommand {
  kind: 'ns';
  namespace: string;
}

/** Quit command */
export interface QuitCommand {
  kind: 'quit';
}

/** Navigate-to-resource command (produced by !<resource>) */
export interface NavigateCommand {
  kind: 'navigate';
  action: AgentAction & { action: 'navigate' };
}

/** Unknown ! command */
export interface UnknownCommand {
  kind: 'unknown';
  raw: string;
}

export type BangCommand =
  | CtxCommand
  | NsCommand
  | QuitCommand
  | NavigateCommand
  | UnknownCommand;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a bang command from raw input.
 *
 * Returns null if the input does not start with `!` (not a bang command).
 * Returns a BangCommand otherwise (may be `unknown` if unrecognized).
 */
export function parseBangCommand(input: string): BangCommand | null {
  if (!input.startsWith('!')) {
    return null;
  }

  // Work with the raw suffix (after '!') preserving internal whitespace
  const rawBody = input.slice(1);
  const body = rawBody.trim();
  const lower = body.toLowerCase();

  // !ctx
  if (lower === 'ctx') {
    return { kind: 'ctx' };
  }

  // !q / !quit
  if (lower === 'q' || lower === 'quit') {
    return { kind: 'quit' };
  }

  // !ns <name> — switch namespace; requires a non-empty argument.
  // Detected when rawBody starts with 'ns' followed by whitespace (or only whitespace after).
  // "!ns" alone (no whitespace at all) falls through to alias lookup (navigate to Namespace).
  const lowerRaw = rawBody.toLowerCase();
  if (lowerRaw.startsWith('ns') && rawBody.length > 2) {
    // There is something after "ns" — check it's a space separator
    const afterNs = rawBody.slice(2);
    if (afterNs.startsWith(' ')) {
      const ns = afterNs.trim();
      if (ns.length > 0) {
        return { kind: 'ns', namespace: ns };
      }
      // "!ns " with only whitespace after → unknown
      return { kind: 'unknown', raw: input };
    }
  }

  // !<resource> — delegate to alias dictionary
  const kind = resolveKind(body);
  if (kind !== undefined) {
    return {
      kind: 'navigate',
      action: { action: 'navigate', resource: kind },
    };
  }

  return { kind: 'unknown', raw: input };
}
