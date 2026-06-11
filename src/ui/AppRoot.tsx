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
}

export function AppRoot({
  state,
  callbacks,
  contextFilter,
}: AppRootProps): React.ReactElement {
  const sidebarWidthCols = Math.round(state.sidebarRatio * 80);

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
          />
        )}
        renderList={() => null}
        renderDetail={() => null}
        renderCommandBar={() => (
          <CommandBar
            context={state.context}
            namespace={state.namespace}
            resourceKind={state.activeKind}
            mode={state.mode}
            focused={state.focus === 'commandbar'}
            hints={[...state.hints]}
          />
        )}
      />
      <ContextSwitcher
        open={state.contextSwitcherOpen}
        contexts={[...state.allContexts]}
        currentContext={state.context}
        filter={contextFilter}
        onSelect={callbacks.onContextSelect}
        onClose={callbacks.onContextSwitcherClose}
      />
      <HelpOverlay open={state.helpOpen} onClose={callbacks.onHelpClose} />
    </Box>
  );
}
