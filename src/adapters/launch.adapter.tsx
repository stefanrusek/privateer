// Production launch path (coverage-excluded glue, Spec 08 §5.2). First run
// shows the model chooser (Gemma / Qwen / no agent), downloads the chosen
// model when needed (Spec 04 §13), then constructs the LiveController
// (kubeconfig → watches → store) and renders the Ink TUI.
import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { totalmem } from 'node:os';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import type { LaunchOptions } from '../cli/args.js';
import { DownloadManager, type DownloadState } from '../model/download.js';
import { FirstRunScreen } from '../ui/components/FirstRunScreen.js';
import {
  ModelChooser,
  type ModelOption,
} from '../ui/components/ModelChooser.js';
import { parseConfig } from '../config/schema.js';
import type { RawConfig } from '../boundaries/config-store.js';
import { LiveController } from './live/controller.js';
import { LiveApp } from './live/LiveApp.js';
import { installMouseExitGuards } from './live/mouse-lifecycle.js';
import {
  TransformersModelDownloader,
  isModelCached,
  agentModelInfo,
  AGENT_MODELS,
  type AgentModelInfo,
} from './model-downloader.adapter.js';

function ConnectionError({ message }: { message: string }): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="red">p9r could not connect to a cluster.</Text>
      <Text dimColor>{message}</Text>
      <Text dimColor>
        Check your kubeconfig / current-context and try again.
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Config file helpers (the chooser persists its decision)
// ---------------------------------------------------------------------------

function configPath(): string {
  return join(homedir(), '.config', 'p9r', 'config.yaml');
}

function readRawConfig(): RawConfig {
  try {
    if (!existsSync(configPath())) {
      return {};
    }
    const parsed = loadYaml(readFileSync(configPath(), 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as RawConfig)
      : {};
  } catch {
    return {};
  }
}

/** Merge the chooser's decision into config.yaml, preserving other keys. */
function persistAgentChoice(patch: {
  model?: string;
  enabled?: boolean;
}): void {
  try {
    const raw = readRawConfig();
    const agent =
      typeof raw.agent === 'object' && raw.agent !== null
        ? (raw.agent as Record<string, unknown>)
        : {};
    if (patch.model !== undefined) {
      agent.model = patch.model;
      delete agent.enabled;
    }
    if (patch.enabled !== undefined) {
      agent.enabled = patch.enabled;
    }
    mkdirSync(join(homedir(), '.config', 'p9r'), { recursive: true });
    writeFileSync(configPath(), dumpYaml({ ...raw, agent }));
  } catch {
    // Persistence is best-effort; the session still uses the choice.
  }
}

// ---------------------------------------------------------------------------
// First-run model chooser (big logo + three options)
// ---------------------------------------------------------------------------

type ChooserResult = { kind: 'model'; info: AgentModelInfo } | { kind: 'none' };

function chooserOptions(): ModelOption[] {
  // Gemma is the spec's intended model and the right default on real
  // hardware; small machines (like an 8GB laptop) get steered to Qwen.
  const gemmaRecommended = totalmem() >= 12 * 1024 ** 3;
  return [
    {
      id: 'gemma',
      title: 'Gemma 3n E2B',
      detail: 'Best answers · ~3GB download · heavier inference',
      ...(gemmaRecommended ? { recommended: true } : {}),
    },
    {
      id: 'qwen',
      title: 'Qwen3 0.6B',
      detail: 'Small & fast · ~550MB download · great on light machines',
      ...(gemmaRecommended ? {} : { recommended: true }),
    },
    {
      id: 'none',
      title: 'No agent',
      detail: 'Skip the download — !commands and navigation still work',
    },
  ];
}

function ModelChooserFlow({
  onDone,
}: {
  onDone: (result: ChooserResult) => void;
}): React.ReactElement {
  const options = chooserOptions();
  const [selected, setSelected] = useState(
    Math.max(
      0,
      options.findIndex((option) => option.recommended === true),
    ),
  );
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelected((current) => Math.min(current + 1, options.length - 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelected((current) => Math.max(current - 1, 0));
      return;
    }
    if (key.return) {
      const option = options[selected];
      if (option === undefined) {
        return;
      }
      if (option.id === 'none') {
        persistAgentChoice({ enabled: false });
        onDone({ kind: 'none' });
        return;
      }
      const info = AGENT_MODELS[option.id as 'gemma' | 'qwen'];
      persistAgentChoice({ model: info.id });
      onDone({ kind: 'model', info });
    }
  });

  return <ModelChooser options={options} selectedIndex={selected} />;
}

// ---------------------------------------------------------------------------
// First-run download screen
// ---------------------------------------------------------------------------

/** First-run download screen wrapper: drives the downloader, then continues. */
function FirstRunFlow({
  model,
  onDone,
}: {
  model: AgentModelInfo;
  onDone: (succeeded: boolean) => void;
}): React.ReactElement {
  const [state, setState] = useState<DownloadState>(
    new DownloadManager(model.totalBytes).snapshot(),
  );
  const { exit } = useApp();

  useEffect(() => {
    const manager = new DownloadManager(model.totalBytes);
    const downloader = new TransformersModelDownloader(model.id);
    const handle = downloader.start((sample) => {
      manager.report(sample);
      setState(manager.snapshot());
    });
    void handle.done.then((result) => {
      if (result.ok) {
        manager.beginVerify();
        manager.finishVerify(true);
        setState(manager.snapshot());
        onDone(true);
      } else {
        manager.fail(result.error.message);
        setState(manager.snapshot());
        if (result.error.kind === 'cancelled') {
          exit();
        } else {
          onDone(false);
        }
      }
    });
    return () => {
      handle.cancel();
    };
  }, []);

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      exit();
    }
  });

  return <FirstRunScreen state={state} modelName={model.displayName} />;
}

// ---------------------------------------------------------------------------
// Live app
// ---------------------------------------------------------------------------

function launchLiveApp(options: LaunchOptions): void {
  let instance: ReturnType<typeof render> | null = null;
  const controller = new LiveController(options, () => {
    instance?.unmount();
  });
  const mouse = controller.mouseLifecycle();
  // THE invariant (Spec 01 §3.5): mouse modes hard-disabled on every exit path.
  // tearDown() is idempotent, so these guards never clash with React cleanup.
  installMouseExitGuards(mouse);
  // Exec suspend-and-handover (Spec 05 §4.3): unmount the Ink tree to
  // restore the terminal, run the raw-TTY command, then re-render. The
  // controller keeps all state and streams across the remount.
  controller.setSuspendRunner((run) => {
    instance?.unmount();
    mouse.tearDown();
    void run().then(() => {
      instance = render(<LiveApp controller={controller} />);
    });
  });
  instance = render(<LiveApp controller={controller} />);
  controller.preloadEngine();
}

/** Download `model` (unless cached), then enter the TUI. */
function downloadThenLaunch(
  model: AgentModelInfo,
  options: LaunchOptions,
): void {
  if (isModelCached(model.id)) {
    launchLiveApp(options);
    return;
  }
  const firstRun = render(
    <FirstRunFlow
      model={model}
      onDone={(succeeded) => {
        firstRun.unmount();
        // On download failure the TUI still launches without the agent.
        launchLiveApp(succeeded ? options : { ...options, noAgent: true });
      }}
    />,
  );
}

export function productionLaunch(options: LaunchOptions): void {
  try {
    const raw = readRawConfig();
    const config = parseConfig(raw);
    const agentSection =
      typeof raw.agent === 'object' && raw.agent !== null
        ? (raw.agent as Record<string, unknown>)
        : {};
    const hasChoice =
      typeof agentSection.model === 'string' ||
      typeof agentSection.enabled === 'boolean';

    if (options.noAgent || !config.agentEnabled) {
      launchLiveApp({ ...options, noAgent: true });
      return;
    }

    if (hasChoice) {
      const modelId = config.agentModel.startsWith('gemma-4-')
        ? AGENT_MODELS.gemma.id
        : config.agentModel;
      downloadThenLaunch(agentModelInfo(modelId), options);
      return;
    }

    // True first run: no model configured and nothing cached → chooser.
    if (
      isModelCached(AGENT_MODELS.gemma.id) ||
      isModelCached(AGENT_MODELS.qwen.id)
    ) {
      // A model is already on disk (e.g. pre-seeded) — just use the default.
      launchLiveApp(options);
      return;
    }
    const chooser = render(
      <ModelChooserFlow
        onDone={(result) => {
          chooser.unmount();
          if (result.kind === 'none') {
            launchLiveApp({ ...options, noAgent: true });
          } else {
            downloadThenLaunch(result.info, options);
          }
        }}
      />,
    );
  } catch (e) {
    render(<ConnectionError message={String(e)} />);
  }
}
