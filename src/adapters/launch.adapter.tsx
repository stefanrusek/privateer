// Production launch path (coverage-excluded glue, Spec 08 §5.2). Constructs the
// real cluster adapters and renders the Ink TUI. The live state↔store binding
// (feeding watch-stream data into the prop-driven views) is the remaining
// integration layer; this renders the navigable shell and reports connection
// problems gracefully.
import React, { useState } from 'react';
import { render, useApp, useInput, Box, Text } from 'ink';
import { KubeConfig } from '@kubernetes/client-node';
import type { LaunchOptions } from '../cli/args.js';
import { AppRoot, type AppRootCallbacks } from '../ui/index.js';
import type { AppState } from '../ui/types.js';
import { initialAppState } from '../cli/initial-state.js';
import { KubeClientAdapter } from './kube-client.adapter.js';

function loadKubeConfig(options: LaunchOptions): KubeConfig {
  const kc = new KubeConfig();
  if (options.kubeconfig !== undefined) {
    kc.loadFromFile(options.kubeconfig);
  } else {
    kc.loadFromDefault();
  }
  if (options.context !== undefined) {
    kc.setCurrentContext(options.context);
  }
  return kc;
}

function LiveApp({ initial }: { initial: AppState }): React.ReactElement {
  const [state, setState] = useState(initial);
  const [contextFilter, setContextFilter] = useState('');
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q' && state.mode === 'normal') {
      exit();
    }
  });

  const callbacks: AppRootCallbacks = {
    onSelectKind: (kind) => {
      setState((s) => ({ ...s, activeKind: kind }));
    },
    onToggleCategory: (cat) => {
      setState((s) => {
        const collapsed = new Set(s.collapsedCategories);
        if (collapsed.has(cat)) {
          collapsed.delete(cat);
        } else {
          collapsed.add(cat);
        }
        return { ...s, collapsedCategories: collapsed };
      });
    },
    onNamespaceChange: (namespace) => {
      setState((s) => ({ ...s, namespace }));
    },
    onSearchChange: (search) => {
      setState((s) => ({ ...s, search }));
    },
    onContextSelect: (context) => {
      setState((s) => ({ ...s, context, contextSwitcherOpen: false }));
    },
    onContextSwitcherClose: () => {
      setContextFilter('');
      setState((s) => ({ ...s, contextSwitcherOpen: false }));
    },
    onHelpClose: () => {
      setState((s) => ({ ...s, helpOpen: false }));
    },
    onFocusChange: (focus) => {
      setState((s) => ({ ...s, focus }));
    },
  };

  return (
    <AppRoot
      state={state}
      callbacks={callbacks}
      contextFilter={contextFilter}
    />
  );
}

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
    const kc = loadKubeConfig(options);
    const client = new KubeClientAdapter(kc);
    const contexts = client.listContexts().map((c) => c.name);
    const initial = initialAppState({
      context: client.currentContext(),
      namespace: options.namespace ?? '',
      contexts,
      namespaces: [],
    });
    render(<LiveApp initial={initial} />);
  } catch (e) {
    render(<ConnectionError message={String(e)} />);
  }
}
