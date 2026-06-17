/**
 * AppRoot — top-level composition root for the Privateer TUI.
 * Prop-driven: all state flows in via AppState, all changes go out via callbacks.
 * Spec 02 §3.
 */

import React from 'react';
import { Box } from 'ink';
import type { AppState } from './types.js';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { CommandBar } from './components/CommandBar.js';
import { ContextSwitcher } from './components/ContextSwitcher.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { SIDEBAR_CATEGORIES } from './sidebar-data.js';
import { computeFrame } from './layout-geometry.js';
import { computeBorderGrid, focusedRegion } from './frame.js';
import { FrameChrome } from './components/FrameChrome.js';

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
   * Real terminal dimensions. When provided, the sidebar width and its viewport
   * height come from `computeFrame` (the single geometry source). When absent,
   * layout assumes an 80×24 frame and the sidebar is unwindowed.
   */
  terminalSize?: { columns: number; rows: number };
  /**
   * Replaces the command bar row when set (inline confirm dialogs render in
   * the command bar per Spec 04 §12).
   */
  commandBarContent?: React.ReactNode;
  /**
   * The active detail tab (when the detail pane is focused). Plumbed into the
   * help overlay so it can lead with the current tab's key group (B09).
   */
  detailTab?: string | null;
  /** The help overlay's scroll offset (controller-owned, B09). */
  helpScroll?: number;
  /**
   * Optional measured header slot (navigation-overhaul chunk 04 / B04b). When
   * provided (by the live adapter), it replaces the default presentational
   * `<Header>` with measured widgets — context/search `<Button>`s and the
   * namespace filterable `<DropdownButton>`. The default `<Header>` is retained
   * for tests and any non-measured host.
   */
  headerSlot?: React.ReactNode;
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
  headerSlot,
  detailTab = null,
  helpScroll = 0,
}: AppRootProps): React.ReactElement {
  // Sidebar width comes from the single geometry source (Spec 02 §"Single
  // source of truth"); no ad-hoc formula lives here. When the real terminal
  // size is unknown, assume an 80×24 frame.
  const frame = computeFrame({
    columns: terminalSize?.columns ?? 80,
    rows: terminalSize?.rows ?? 24,
    sidebarRatio: state.sidebarRatio,
    verticalRatio: state.verticalRatio,
    showDetail: state.showDetail,
  });
  const sidebarViewport =
    terminalSize === undefined ? {} : { viewportHeight: frame.sidebar.height };

  // The collapsed-grid border glyphs come from the pure frame model; the
  // focused region's border is double-weight + accent with zero layout movement
  // (Spec 02 §"Region titles & focus highlight").
  const grid = computeBorderGrid({
    frame,
    columns: terminalSize?.columns ?? 80,
    rows: terminalSize?.rows ?? 24,
    focus: focusedRegion(state.focus, state.headerFocus !== null),
  });

  // Full-screen overlays replace the main layout entirely so the frame never
  // grows taller than the terminal (Ink cannot reclaim overflowed rows).
  if (state.helpOpen) {
    // Leave room for the overlay's title, spacer, and close hint (5 chrome rows
    // + the double border) so the body scrolls within the terminal.
    const helpViewport = Math.max(1, (terminalSize?.rows ?? 24) - 7);
    return (
      <HelpOverlay
        open
        onClose={callbacks.onHelpClose}
        focus={state.focus}
        tab={detailTab}
        scrollOffset={helpScroll}
        viewportHeight={helpViewport}
      />
    );
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
      <FrameChrome
        frame={frame}
        grid={grid}
        renderHeader={() =>
          headerSlot ?? (
            <Header
              context={state.context}
              namespace={state.namespace}
              allNamespaces={[...state.allNamespaces]}
              search={state.search}
              onNamespaceChange={callbacks.onNamespaceChange}
              onSearchChange={callbacks.onSearchChange}
              focused={state.headerFocus}
            />
          )
        }
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
