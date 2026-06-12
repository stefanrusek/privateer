import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import {
  PortForwardManager,
  ForwardCountIndicator,
  QuitGuardPrompt,
} from './PortForwardManager.js';
import type { PortForward, RecentForward } from '../../portforward/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop(): void {
  return;
}

function makeForward(
  overrides: Partial<PortForward> & { id: string },
): PortForward {
  return {
    podName: 'my-pod',
    namespace: 'default',
    remotePort: 8080,
    localPort: 8080,
    status: 'active',
    ...overrides,
  };
}

function makeRecent(overrides?: Partial<RecentForward>): RecentForward {
  return {
    podName: 'old-pod',
    namespace: 'default',
    remotePort: 5432,
    localPort: 5432,
    ...overrides,
  };
}

const NO_FORWARDS: readonly PortForward[] = [];
const NO_RECENTS: readonly RecentForward[] = [];

// ---------------------------------------------------------------------------
// PortForwardManager
// ---------------------------------------------------------------------------

describe('PortForwardManager', () => {
  it('renders title', () => {
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: NO_FORWARDS,
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).toContain('Port Forwards');
  });

  it('renders New Forward button', () => {
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: NO_FORWARDS,
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).toContain('+ New Forward');
  });

  it('renders Close button', () => {
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: NO_FORWARDS,
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).toContain('Close');
  });

  it('renders active forward with green indicator', () => {
    const fwd = makeForward({ id: '1', status: 'active' });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('●');
    expect(frame).toContain('my-pod');
    expect(frame).toContain('8080');
  });

  it('renders starting forward with indicator', () => {
    const fwd = makeForward({ id: '1', status: 'starting' });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).toContain('●');
  });

  it('renders failed forward with X indicator', () => {
    const fwd = makeForward({
      id: '1',
      status: 'failed',
      failReason: 'pod not found',
    });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('✕');
    expect(frame).toContain('pod not found');
  });

  it('renders retry button for failed forward', () => {
    const fwd = makeForward({ id: '1', status: 'failed' });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).toContain('retry');
  });

  it('renders stop button for active forward', () => {
    const fwd = makeForward({ id: '1', status: 'active' });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).toContain('✕');
  });

  it('renders RECENT section when recents present', () => {
    const recent = makeRecent();
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: NO_FORWARDS,
        recents: [recent],
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('RECENT');
    expect(frame).toContain('old-pod');
    expect(frame).toContain('Restore');
  });

  it('does not render RECENT section when no recents', () => {
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: NO_FORWARDS,
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).not.toContain('RECENT');
  });

  it('renders multiple forwards', () => {
    const fwd1 = makeForward({ id: '1', remotePort: 8080, localPort: 8080 });
    const fwd2 = makeForward({ id: '2', remotePort: 9090, localPort: 9090 });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd1, fwd2],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('8080');
    expect(frame).toContain('9090');
  });

  it('renders failed forward without failReason when undefined', () => {
    const fwd = makeForward({ id: '1', status: 'failed' });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    // Should render without error
    expect(lastFrame()).toContain('retry');
  });

  it('renders namespace in row', () => {
    const fwd = makeForward({ id: '1', namespace: 'kube-system' });
    const { lastFrame } = render(
      React.createElement(PortForwardManager, {
        forwards: [fwd],
        recents: NO_RECENTS,
        onStop: noop,
        onRetry: noop,
        onNewForward: noop,
        onClose: noop,
      }),
    );
    expect(lastFrame()).toContain('kube-system');
  });
});

// ---------------------------------------------------------------------------
// ForwardCountIndicator
// ---------------------------------------------------------------------------

describe('ForwardCountIndicator', () => {
  it('renders count when active forwards > 0', () => {
    const { lastFrame } = render(
      React.createElement(ForwardCountIndicator, { activeCount: 2 }),
    );
    expect(lastFrame()).toContain('⇄ 2');
  });

  it('renders nothing when activeCount is 0', () => {
    const { lastFrame } = render(
      React.createElement(ForwardCountIndicator, { activeCount: 0 }),
    );
    expect(lastFrame() ?? '').not.toContain('⇄');
  });

  it('renders single count', () => {
    const { lastFrame } = render(
      React.createElement(ForwardCountIndicator, { activeCount: 1 }),
    );
    expect(lastFrame()).toContain('⇄ 1');
  });

  it('renders with onPress handler', () => {
    const { lastFrame } = render(
      React.createElement(ForwardCountIndicator, {
        activeCount: 3,
        onPress: noop,
      }),
    );
    expect(lastFrame()).toContain('⇄ 3');
  });
});

// ---------------------------------------------------------------------------
// QuitGuardPrompt
// ---------------------------------------------------------------------------

describe('QuitGuardPrompt', () => {
  it('shows plural count', () => {
    const { lastFrame } = render(
      React.createElement(QuitGuardPrompt, {
        activeCount: 2,
        onQuit: noop,
        onCancel: noop,
      }),
    );
    expect(lastFrame()).toContain('2 port-forwards active');
  });

  it('shows singular count', () => {
    const { lastFrame } = render(
      React.createElement(QuitGuardPrompt, {
        activeCount: 1,
        onQuit: noop,
        onCancel: noop,
      }),
    );
    expect(lastFrame()).toContain('1 port-forward active');
  });

  it('shows Quit button', () => {
    const { lastFrame } = render(
      React.createElement(QuitGuardPrompt, {
        activeCount: 2,
        onQuit: noop,
        onCancel: noop,
      }),
    );
    expect(lastFrame()).toContain('Quit');
  });

  it('shows Cancel button', () => {
    const { lastFrame } = render(
      React.createElement(QuitGuardPrompt, {
        activeCount: 2,
        onQuit: noop,
        onCancel: noop,
      }),
    );
    expect(lastFrame()).toContain('Cancel');
  });

  it('shows Quit before Cancel', () => {
    const { lastFrame } = render(
      React.createElement(QuitGuardPrompt, {
        activeCount: 2,
        onQuit: noop,
        onCancel: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    const quitIdx = frame.indexOf('Quit');
    const cancelIdx = frame.indexOf('Cancel');
    expect(quitIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeGreaterThan(-1);
    expect(quitIdx).toBeLessThan(cancelIdx);
  });
});
