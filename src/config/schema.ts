import type { RawConfig } from '../boundaries/config-store.js';
import type { ThemeName } from '../cli/theme.js';

/** Typed, defaulted configuration parsed from `~/.config/p9r/config.yaml`. */
export interface P9rConfig {
  activeContext?: string;
  prometheusUrl?: string;
  ui: {
    mouseSupport: boolean;
    refreshInterval: number;
    idleStreamTimeout: number;
    theme: ThemeName;
  };
  hiddenResources: string[];
  lagThresholds: { warning: number; critical: number };
  agentModel: string;
  /** Inference timeout in seconds (Spec 07 §9 default: 15). */
  agentTimeoutSeconds: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asTheme(value: unknown): ThemeName {
  return value === 'light' ? 'light' : 'dark';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

/** Parse raw config into the typed shape with defaults (Spec 01 §4). */
export function parseConfig(raw: RawConfig): P9rConfig {
  const ui = asRecord(raw.ui);
  const prometheus = asRecord(raw.prometheus);
  const lag = asRecord(raw.lagThresholds);
  const agent = asRecord(raw.agent);

  const config: P9rConfig = {
    ui: {
      mouseSupport: asBool(ui.mouseSupport, true),
      refreshInterval: asNumber(ui.refreshInterval, 30),
      idleStreamTimeout: asNumber(ui.idleStreamTimeout, 300),
      theme: asTheme(ui.theme),
    },
    hiddenResources: asStringArray(raw.hiddenResources),
    lagThresholds: {
      warning: asNumber(lag.warning, 10_000),
      critical: asNumber(lag.critical, 10_000),
    },
    agentModel: asString(agent.model, 'gemma-4-E2B-it-onnx'),
    agentTimeoutSeconds: asNumber(agent.timeoutSeconds, 15),
  };

  const activeContext = raw.activeContext;
  if (typeof activeContext === 'string') {
    config.activeContext = activeContext;
  }
  const url = prometheus.url;
  if (typeof url === 'string') {
    config.prometheusUrl = url;
  }
  return config;
}
