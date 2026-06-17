/**
 * Public API for the Privateer UI layer.
 * Spec 02 §3.
 */

export { AppRoot } from './AppRoot.js';
export type { AppRootProps, AppRootCallbacks } from './AppRoot.js';
export type {
  AppState,
  FocusRegion,
  Mode,
  SidebarItem,
  SidebarCategory,
  SidebarLeaf,
  BadgeTier,
} from './types.js';
export { SIDEBAR_CATEGORIES, buildSidebarTree } from './sidebar-data.js';
export { useFocus } from './use-focus.js';
export type { UseFocusResult } from './use-focus.js';
export { usePaneRatios } from './use-pane-ratios.js';
export type { UsePaneRatiosResult } from './use-pane-ratios.js';
export { Sidebar } from './components/Sidebar.js';
export type { SidebarProps } from './components/Sidebar.js';
export { Header } from './components/Header.js';
export type { HeaderProps } from './components/Header.js';
export { CommandBar } from './components/CommandBar.js';
export type { CommandBarProps } from './components/CommandBar.js';
export { ContextSwitcher } from './components/ContextSwitcher.js';
export type { ContextSwitcherProps } from './components/ContextSwitcher.js';
export { HelpOverlay } from './components/HelpOverlay.js';
export type { HelpOverlayProps } from './components/HelpOverlay.js';
export {
  KEYMAP,
  groupsFor,
  scopeForFocus,
  helpLines,
  acceleratorSet,
  keymapIssues,
  renderKeymapMarkdown,
} from './keymap.js';
export type {
  Scope,
  KeyBinding,
  KeyGroup,
  HelpLine,
  KeymapIssue,
} from './keymap.js';
export { Layout } from './components/Layout.js';
export type { LayoutProps } from './components/Layout.js';

import { AppRoot } from './AppRoot.js';

/** Factory for the UI (accepts future dependencies). */
export function createUi(_deps: Record<string, unknown>): {
  AppRoot: typeof AppRoot;
} {
  return { AppRoot };
}
