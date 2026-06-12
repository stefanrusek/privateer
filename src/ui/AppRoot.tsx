/**
 * AppRoot — top-level composition root for the Privateer TUI.
 * Prop-driven: all state flows in via AppState, all changes go out via callbacks.
 * Spec 02 §3.
 */

import React from 'react';
import { Box } from 'ink';
import type { AppState } from './types.js';
import { Layout } from './components/Layout.js';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { CommandBar } from './components/CommandBar.js';
import { ContextSwitcher } from './components/ContextSwitcher.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { SIDEBAR_CATEGORIES } from './sidebar-data.js';

export interface AppRootCallbacks {
  onSelectKind: (kind: string) => void;
  onToggleCategory: (cat: string) => void;
  onNamespaceChange: (ns: string) => void;
  onSearchChange: (s: string) => void;
  onContextSelect: (ctx: string) => void;
  onContextSwitcherClose: () => void;
  onHelpClose: () => void;
  onFocusChange: (region: AppState['focus']) => void;
}

export interface AppRootProps {
  state: AppState;
  callbacks: AppRootCallbacks;
  /** Context switcher filter text (managed externally). */
  contextFilter: string;
  /** Renders the list pane content. */
  renderList?: () => React.ReactNode;
  /** Renders the detail pane content. */
  renderDetail?: () => React.ReactNode;
  /** Keyboard cursor target passed through to the sidebar. */
  cursorKind?: string | null;
  /** Command bar input text (rendered while the bar is focused). */
  inputText?: string;
  /**
   * Real terminal dimensions. When provided, the sidebar width is derived
   * from the actual column count (min 16) and the sidebar gets a viewport
   * height of `rows - 3` (header + command bar + margin, min 5). When
   * absent, layout assumes 80 columns and the sidebar is unwindowed.
   */
  terminalSize?: { columns: number; rows: number };
  /**
   * Replaces the command bar row when set (inline confirm dialogs render in
   * the command bar per Spec 04 §12).
   */
  commandBarContent?: React.ReactNode;
}

export function AppRoot({
  state,
  callbacks,
  contextFilter,
  renderList,
  renderDetail,
  cursorKind = null,
  inputText = '',
  terminalSize,
  commandBarContent,
}: AppRootProps): React.ReactElement {
  const sidebarWidthCols =
    terminalSize === undefined
      ? Math.round(state.sidebarRatio * 80)
      : Math.max(16, Math.round(state.sidebarRatio * terminalSize.columns));
  const sidebarViewport =
    terminalSize === undefined
      ? {}
      : { viewportHeight: Math.max(5, terminalSize.rows - 3) };

  // Full-screen overlays replace the main layout entirely so the frame never
  // grows taller than the terminal (Ink cannot reclaim overflowed rows).
  if (state.helpOpen) {
    return <HelpOverlay open onClose={callbacks.onHelpClose} />;
  }
  if (state.contextSwitcherOpen) {
    return (
      <ContextSwitcher
        open
        contexts={[...state.allContexts]}
        currentContext={state.context}
        filter={contextFilter}
        onSelect={callbacks.onContextSelect}
        onClose={callbacks.onContextSwitcherClose}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Layout
        sidebarWidth={sidebarWidthCols}
        verticalSplit={state.verticalRatio}
        showDetail={state.showDetail}
        renderHeader={() => (
          <Header
            namespace={state.namespace}
            allNamespaces={[...state.allNamespaces]}
            search={state.search}
            onNamespaceChange={callbacks.onNamespaceChange}
            onSearchChange={callbacks.onSearchChange}
            focused={state.headerFocus}
          />
        )}
        renderSidebar={() => (
          <Sidebar
            items={SIDEBAR_CATEGORIES}
            activeKind={state.activeKind}
            badgeCounts={state.badgeCounts}
            dimmedKinds={state.dimmedKinds}
            forbiddenKinds={state.forbiddenKinds}
            focusActive={state.focus === 'sidebar'}
            onSelect={callbacks.onSelectKind}
            onToggleCategory={callbacks.onToggleCategory}
            collapsedCategories={state.collapsedCategories}
            cursorKind={cursorKind}
            {...sidebarViewport}
          />
        )}
        renderList={renderList ?? ((): null => null)}
        renderDetail={renderDetail ?? ((): null => null)}
        renderCommandBar={() =>
          commandBarContent ?? (
            <CommandBar
              context={state.context}
              namespace={state.namespace}
              resourceKind={state.activeKind}
              mode={state.mode}
              focused={state.focus === 'commandbar'}
              hints={[...state.hints]}
              inputText={inputText}
            />
          )
        }
      />
    </Box>
  );
}
