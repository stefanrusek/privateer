import { describe, it, expect } from 'vitest';
import {
  createUi,
  AppRoot,
  SIDEBAR_CATEGORIES,
  buildSidebarTree,
  useFocus,
  usePaneRatios,
  Sidebar,
  Header,
  CommandBar,
  ContextSwitcher,
  HelpOverlay,
  Layout,
  KEYMAP,
  renderKeymapMarkdown,
} from './index.js';

describe('ui/index', () => {
  it('createUi returns an object with AppRoot', () => {
    const ui = createUi({});
    expect(ui.AppRoot).toBe(AppRoot);
  });

  it('exports SIDEBAR_CATEGORIES', () => {
    expect(SIDEBAR_CATEGORIES).toBeDefined();
    expect(SIDEBAR_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('exports buildSidebarTree', () => {
    expect(typeof buildSidebarTree).toBe('function');
  });

  it('exports useFocus', () => {
    expect(typeof useFocus).toBe('function');
  });

  it('exports usePaneRatios', () => {
    expect(typeof usePaneRatios).toBe('function');
  });

  it('exports Sidebar component', () => {
    expect(typeof Sidebar).toBe('function');
  });

  it('exports Header component', () => {
    expect(typeof Header).toBe('function');
  });

  it('exports CommandBar component', () => {
    expect(typeof CommandBar).toBe('function');
  });

  it('exports ContextSwitcher component', () => {
    expect(typeof ContextSwitcher).toBe('function');
  });

  it('exports HelpOverlay component', () => {
    expect(typeof HelpOverlay).toBe('function');
  });

  it('exports Layout component', () => {
    expect(typeof Layout).toBe('function');
  });

  it('exports the KEYMAP registry and its README generator', () => {
    expect(Array.isArray(KEYMAP)).toBe(true);
    expect(typeof renderKeymapMarkdown).toBe('function');
  });
});
