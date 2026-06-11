// Production launch path (coverage-excluded glue, Spec 08 §5.2). Constructs
// the LiveController (kubeconfig → watches → store) and renders the Ink TUI.
import React from 'react';
import { render, Box, Text } from 'ink';
import type { LaunchOptions } from '../cli/args.js';
import { LiveController } from './live/controller.js';
import { LiveApp } from './live/LiveApp.js';

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

export function productionLaunch(options: LaunchOptions): void {
  try {
    let unmount: () => void = () => undefined;
    const controller = new LiveController(options, () => {
      unmount();
    });
    const instance = render(<LiveApp controller={controller} />);
    unmount = () => {
      instance.unmount();
    };
  } catch (e) {
    render(<ConnectionError message={String(e)} />);
  }
}
