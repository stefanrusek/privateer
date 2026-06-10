import type { Result } from '../core/result.js';

/**
 * InferenceEngine boundary (Spec 07, Spec 08 §5.1). Wraps the local LLM. The
 * production adapter uses `@huggingface/transformers` (Gemma 4 E2B via ONNX);
 * `FixtureEngine` replays recorded request→response fixtures so the
 * deterministic shell around the model is fully covered.
 */
export interface InferenceEngine {
  /**
   * Run one inference step. The model may either request tool calls or emit a
   * final assistant message. Tool results are fed back as further messages on
   * the next call (the round loop lives in the agent layer, Spec 07 §9).
   */
  generate(
    request: InferenceRequest,
  ): Promise<Result<InferenceResponse, InferenceError>>;
}

export interface InferenceRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  /** Thinking mode: off for navigation, on for diagnostics (Spec 07 §11.1). */
  thinking: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant messages that requested tool calls. */
  toolCalls?: ToolCall[];
  /** Present on tool messages — which call this result answers. */
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON-schema-shaped parameter description. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON argument string as emitted by the model. */
  arguments: string;
}

export interface InferenceResponse {
  /** Tool calls the model wants resolved, if any. */
  toolCalls: ToolCall[];
  /** Final assistant text when no tool calls are requested. */
  content: string;
}

export interface InferenceError {
  kind: 'modelUnavailable' | 'cancelled' | 'runtimeError';
  message: string;
}
