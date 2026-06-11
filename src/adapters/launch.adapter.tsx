// Production launch path (coverage-excluded glue, Spec 08 §5.2). Runs the
// first-run model download when needed (Spec 04 §13), then constructs the
// LiveController (kubeconfig → watches → store) and renders the Ink TUI.
import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import type { LaunchOptions } from '../cli/args.js';
import { DownloadManager, type DownloadState } from '../model/download.js';
import { FirstRunScreen } from '../ui/components/FirstRunScreen.js';
import { LiveController } from './live/controller.js';
import { LiveApp } from './live/LiveApp.js';
import {
  TransformersModelDownloader,
  isModelCached,
  AGENT_MODEL_DISPLAY_NAME,
  AGENT_MODEL_TOTAL_BYTES,
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

/** First-run download screen wrapper: drives the downloader, then continues. */
function FirstRunFlow({
  onDone,
}: {
  onDone: (succeeded: boolean) => void;
}): React.ReactElement {
  const [state, setState] = useState<DownloadState>(
    new DownloadManager(AGENT_MODEL_TOTAL_BYTES).snapshot(),
  );
  const { exit } = useApp();

  useEffect(() => {
    const manager = new DownloadManager(AGENT_MODEL_TOTAL_BYTES);
    const downloader = new TransformersModelDownloader();
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

  return <FirstRunScreen state={state} modelName={AGENT_MODEL_DISPLAY_NAME} />;
}

function launchLiveApp(options: LaunchOptions): void {
  let instance: ReturnType<typeof render> | null = null;
  const controller = new LiveController(options, () => {
    instance?.unmount();
  });
  // Exec suspend-and-handover (Spec 05 §4.3): unmount the Ink tree to
  // restore the terminal, run the raw-TTY command, then re-render. The
  // controller keeps all state and streams across the remount.
  controller.setSuspendRunner((run) => {
    instance?.unmount();
    void run().then(() => {
      instance = render(<LiveApp controller={controller} />);
    });
  });
  instance = render(<LiveApp controller={controller} />);
  controller.preloadEngine();
}

export function productionLaunch(options: LaunchOptions): void {
  try {
    if (!options.noAgent && !isModelCached()) {
      // First-run: download the agent model before entering the TUI
      // (Spec 04 §13). On failure the TUI still launches without the agent.
      const firstRun = render(
        <FirstRunFlow
          onDone={() => {
            firstRun.unmount();
            launchLiveApp(options);
          }}
        />,
      );
      return;
    }
    launchLiveApp(options);
  } catch (e) {
    render(<ConnectionError message={String(e)} />);
  }
}
