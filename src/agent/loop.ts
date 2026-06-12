/**
 * Agent round loop (Spec 07 §9).
 *
 * Orchestrates inference rounds: up to MAX_ROUNDS of tool calls, then a final
 * action. Uses injected Clock for the 15s timeout — never calls setTimeout
 * or Date.now directly.
 */

import type {
  InferenceEngine,
  ChatMessage,
  ToolDefinition,
} from '../boundaries/inference-engine.js';
import type { Clock } from '../boundaries/clock.js';
import type { AgentAction } from '../command/action.js';
import type { AgentToolDispatcher } from './dispatcher.js';
import { parseAgentOutput } from './parser.js';
import { buildToolDefinitions } from './prompt.js';

// ---------------------------------------------------------------------------
// Constants (Spec 07 §9, §13)
// ---------------------------------------------------------------------------

const MAX_ROUNDS = 5;
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Run loop result
// ---------------------------------------------------------------------------

export type LoopResult =
  | { kind: 'action'; action: AgentAction }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string }
  | { kind: 'parseError'; raw: string };

// ---------------------------------------------------------------------------
// Tool call progress callback
// ---------------------------------------------------------------------------

export type OnToolCall = (
  toolName: string,
  params: Record<string, unknown>,
) => void;

// ---------------------------------------------------------------------------
// Run options
// ---------------------------------------------------------------------------

export interface RunLoopOptions {
  engine: InferenceEngine;
  dispatcher: AgentToolDispatcher;
  clock: Clock;
  messages: ChatMessage[];
  thinking: boolean;
  onToolCall?: OnToolCall;
  /**
   * Tool subset to expose to the model. Defaults to the full catalog;
   * constrained hardware passes a trimmed set to keep the prompt small
   * enough for the 15s budget (Spec 07 §9).
   */
  tools?: ToolDefinition[];
  /**
   * Inference timeout in ms. Defaults to the Spec 07 §9 15s budget;
   * overridable via config (`agent.timeoutSeconds`) for slow hardware.
   */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Run the round loop
// ---------------------------------------------------------------------------

export async function runLoop(options: RunLoopOptions): Promise<LoopResult> {
  const { engine, dispatcher, clock, onToolCall } = options;
  const tools = options.tools ?? buildToolDefinitions();

  // Set up timeout via Clock — use object so TypeScript does not narrow the flag
  const timeoutState = { timedOut: false };
  const cancelHandles: (() => void)[] = [];

  const timeoutPromise = new Promise<LoopResult>((resolve) => {
    const cancel = clock.setTimeout(() => {
      timeoutState.timedOut = true;
      resolve({ kind: 'timeout' });
    }, options.timeoutMs ?? TIMEOUT_MS);
    cancelHandles.push(cancel);
  });

  const loopPromise = (async (): Promise<LoopResult> => {
    const messages: ChatMessage[] = [...options.messages];
    const thinking = options.thinking;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await engine.generate({ messages, tools, thinking });

      if (timeoutState.timedOut) {
        return { kind: 'timeout' };
      }

      if (!result.ok) {
        return { kind: 'error', message: result.error.message };
      }

      const response = result.value;

      // If the model requested tool calls, resolve them and continue
      if (response.toolCalls.length > 0) {
        // Append assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: '',
          toolCalls: response.toolCalls,
        });

        // Resolve each tool call
        for (const toolCall of response.toolCalls) {
          let params: Record<string, unknown>;
          try {
            params = JSON.parse(toolCall.arguments) as Record<string, unknown>;
          } catch {
            params = {};
          }

          if (onToolCall !== undefined) {
            onToolCall(toolCall.name, params);
          }

          let toolResult: unknown;
          try {
            toolResult = dispatcher.dispatch(toolCall.name, params);
          } catch (e: unknown) {
            toolResult = {
              error: e instanceof Error ? e.message : 'unknown error',
            };
          }

          // Cap tool result size at ~600 tokens (~2400 chars)
          const MAX_RESULT_CHARS = 2400;
          let resultStr = JSON.stringify(toolResult);
          if (resultStr.length > MAX_RESULT_CHARS) {
            resultStr =
              resultStr.slice(0, MAX_RESULT_CHARS) +
              '... [truncated — too large to include in full]';
          }

          messages.push({
            role: 'tool',
            content: resultStr,
            toolCallId: toolCall.id,
          });
        }

        // Continue to next round
        continue;
      }

      // No tool calls — parse the final response
      const parseResult = parseAgentOutput(response.content);
      if (parseResult.ok) {
        return { kind: 'action', action: parseResult.action };
      }

      // Parse failed — return as unknown action
      return { kind: 'parseError', raw: response.content };
    }

    // Exceeded max rounds — return timeout-like signal
    return { kind: 'error', message: 'Maximum tool call rounds exceeded' };
  })();

  const result = await Promise.race([loopPromise, timeoutPromise]);

  // Cancel the timeout if we finished before it fired
  for (const cancel of cancelHandles) {
    cancel();
  }

  return result;
}
