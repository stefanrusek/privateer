import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { Logo, LOGO_LINES, LOGO_TAGLINE } from './Logo.js';

/** A flattened <Text> node with its style props, for style assertions. */
interface CollectedText {
  readonly text: string;
  readonly color: string | undefined;
  readonly dim: boolean;
}

function flattenText(children: React.ReactNode): string {
  let out = '';
  for (const child of React.Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') {
      out += String(child);
    } else if (React.isValidElement(child)) {
      const props = child.props as { children?: React.ReactNode };
      out += flattenText(props.children);
    }
  }
  return out;
}

function collectTexts(
  node: React.ReactNode,
  acc: CollectedText[] = [],
): CollectedText[] {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement(child)) {
      continue;
    }
    const props = child.props as {
      children?: React.ReactNode;
      color?: string;
      dimColor?: boolean;
    };
    if (child.type === Text) {
      acc.push({
        text: flattenText(props.children),
        color: props.color,
        dim: props.dimColor === true,
      });
    } else {
      collectTexts(props.children, acc);
    }
  }
  return acc;
}

describe('Logo', () => {
  it('renders every logo line and the tagline', () => {
    const { lastFrame } = render(<Logo />);
    const frame = lastFrame() ?? '';
    for (const line of LOGO_LINES) {
      expect(frame).toContain(line.trimEnd());
    }
    expect(frame).toContain(LOGO_TAGLINE);
  });

  it('pads all logo lines to the same display width', () => {
    expect(LOGO_LINES.length).toBe(6);
    const segmenter = new Intl.Segmenter();
    const widths = new Set(
      LOGO_LINES.map((line) => [...segmenter.segment(line)].length),
    );
    expect(widths.size).toBe(1);
    expect(widths.has(26)).toBe(true);
  });

  it('colors each line on a cyan → blue → magenta ramp', () => {
    const styled = collectTexts(Logo());
    const lines = styled.filter((t) => LOGO_LINES.includes(t.text));
    expect(lines.length).toBe(LOGO_LINES.length);
    expect(lines.map((t) => t.color)).toEqual([
      'cyanBright',
      'cyan',
      'blueBright',
      'blue',
      'magentaBright',
      'magenta',
    ]);
  });

  it('renders the tagline dim', () => {
    const tagline = collectTexts(Logo()).find((t) => t.text === LOGO_TAGLINE);
    expect(tagline?.dim).toBe(true);
  });
});
