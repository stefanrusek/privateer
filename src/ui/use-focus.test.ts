import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { useFocus } from './use-focus.js';

describe('useFocus', () => {
  it('returns the initial focus region', () => {
    function Capturer() {
      const r = useFocus('sidebar');
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame } = render(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
  });

  it('cycleFocus: sidebar → list with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('sidebar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
    captured!.cycleFocus(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('list');
  });

  it('cycleFocus: list → detail with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('list');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocus(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('detail');
  });

  it('cycleFocus: detail → sidebar with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('detail');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocus(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
  });

  it('cycleFocus: sidebar → list without detail', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('sidebar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocus(false);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('list');
  });

  it('cycleFocus: list → sidebar without detail', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('list');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocus(false);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
  });

  it('cycleFocus: non-cycle region falls back to sidebar with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('commandbar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocus(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
  });

  it('cycleFocus: non-cycle region falls back to sidebar without detail', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('commandbar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocus(false);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
  });

  it('cycleFocusReverse: sidebar → detail with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('sidebar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocusReverse(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('detail');
  });

  it('cycleFocusReverse: list → sidebar with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('list');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocusReverse(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
  });

  it('cycleFocusReverse: detail → list with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('detail');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocusReverse(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('list');
  });

  it('cycleFocusReverse: sidebar → list without detail', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('sidebar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocusReverse(false);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('list');
  });

  it('cycleFocusReverse: list → sidebar without detail', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('list');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocusReverse(false);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('sidebar');
  });

  it('cycleFocusReverse: non-cycle region falls back to detail with detail visible', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('commandbar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocusReverse(true);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('detail');
  });

  it('cycleFocusReverse: non-cycle region falls back to list without detail', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('commandbar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.cycleFocusReverse(false);
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('list');
  });

  it('setFocus changes the focus region', () => {
    let captured: ReturnType<typeof useFocus> | undefined;
    function Capturer() {
      const r = useFocus('sidebar');
      captured = r;
      return React.createElement(Text, null, r.focus);
    }
    const { lastFrame, rerender } = render(React.createElement(Capturer));
    captured!.setFocus('commandbar');
    rerender(React.createElement(Capturer));
    expect(lastFrame()).toContain('commandbar');
  });
});
