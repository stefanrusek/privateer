// FrameChrome — presentational Ink renderer for the collapsed-grid Option-A
// chrome (Spec 02 §"Rendering the collapsed grid"). All glyph decisions live in
// the pure `src/ui/frame.ts` model; this component only slices the precomputed
// `BorderGrid` into Ink elements and drops each region's already-rendered
// content into the window at its inner `Rect`.
//
// Layout is composed as strips so switching focus changes only glyph
// weight/colour — never a `Rect`, never a content position. The header and
// command bar span the full width; the sidebar spans the full body height; the
// list and (optional) detail stack in the right column, sharing the collapsed
// sidebar│right and list│detail lines.

import React from 'react';
import { Box, Text } from 'ink';
import type { Frame } from '../layout-geometry.js';
import {
  columnStrip,
  rowCells,
  type BorderCell,
  type BorderGrid,
  type ColumnStrip,
} from '../frame.js';

const ACCENT = 'cyan';

export interface FrameChromeProps {
  frame: Frame;
  grid: BorderGrid;
  renderHeader: () => React.ReactNode;
  renderSidebar: () => React.ReactNode;
  renderList: () => React.ReactNode;
  renderDetail: () => React.ReactNode;
  renderCommandBar: () => React.ReactNode;
}

/** A single border cell, accented (focus) or dim. */
function Cell({ cell }: { cell: BorderCell }): React.ReactElement {
  return cell.accent ? (
    <Text color={ACCENT} bold>
      {cell.glyph}
    </Text>
  ) : (
    <Text dimColor>{cell.glyph}</Text>
  );
}

/** A horizontal run of border cells, coloured per cell. */
function CellRow({ cells }: { cells: BorderCell[] }): React.ReactElement {
  return (
    <Box>
      {cells.map((c, i) => (
        <Cell key={i} cell={c} />
      ))}
    </Box>
  );
}

/** A vertical border strip (one column tall), tinted if it carries focus. */
function VLine({ strip }: { strip: ColumnStrip }): React.ReactElement {
  return strip.accent ? (
    <Text color={ACCENT} bold>
      {strip.glyphs}
    </Text>
  ) : (
    <Text dimColor>{strip.glyphs}</Text>
  );
}

export function FrameChrome({
  frame,
  grid,
  renderHeader,
  renderSidebar,
  renderList,
  renderDetail,
  renderCommandBar,
}: FrameChromeProps): React.ReactElement {
  const lineX = frame.handles.sidebar.position; // sidebar│right column
  const rightEdge = grid.columns - 1;
  const topRow = 0;
  const headerLineY = frame.list.y - 1; // header│body line
  const bottomLineY = frame.commandBar.y - 1; // body│commandbar line
  const bottomRow = grid.rows - 1;
  const bodyTop = headerLineY + 1; // first body inner row
  const bodyBottom = bottomLineY - 1; // last body inner row
  const vline = frame.handles.vertical; // list│detail line (or null)

  // Physical strip heights are derived from the line positions, not from the
  // frame's `Rect.height` fields (those carry B02a's body-budget accounting and
  // can exceed the drawable rows). Sizing content boxes to the real strip
  // heights keeps the chrome inside the terminal and switching focus moves
  // nothing.
  const bodyHeight = Math.max(0, bodyBottom - bodyTop + 1);
  const innerWidth = Math.max(0, grid.columns - 2);
  const listHeight =
    vline !== null ? Math.max(0, vline.position - bodyTop) : bodyHeight;
  const detailHeight =
    vline !== null ? Math.max(0, bodyBottom - vline.position) : 0;

  // Header band: full-width top line, header inner row (left edge, header
  // content spanning the full inner width, right edge), header│body line.
  const headerInner = (
    <Box>
      <VLine strip={columnStrip(grid, 0, frame.header.y, frame.header.y)} />
      <Box width={innerWidth}>{renderHeader()}</Box>
      <VLine
        strip={columnStrip(grid, rightEdge, frame.header.y, frame.header.y)}
      />
    </Box>
  );

  // Body band: a row of vertical strips — left edge, sidebar, sidebar│right
  // line, right column (list / list│detail line / detail), right edge.
  const rightColumn = (
    <Box flexDirection="column" width={frame.list.width}>
      <Box height={listHeight} overflow="hidden">
        {renderList()}
      </Box>
      {vline !== null && frame.detail !== null ? (
        <>
          <CellRow
            cells={rowCells(grid, vline.position, frame.list.x, rightEdge - 1)}
          />
          <Box height={detailHeight} overflow="hidden">
            {renderDetail()}
          </Box>
        </>
      ) : null}
    </Box>
  );

  const bodyBand = (
    <Box>
      <VLine strip={columnStrip(grid, 0, bodyTop, bodyBottom)} />
      <Box width={frame.sidebar.width} height={bodyHeight} overflow="hidden">
        {renderSidebar()}
      </Box>
      <VLine strip={columnStrip(grid, lineX, bodyTop, bodyBottom)} />
      {rightColumn}
      <VLine strip={columnStrip(grid, rightEdge, bodyTop, bodyBottom)} />
    </Box>
  );

  // Command bar band: body│commandbar line, command bar inner row, bottom line.
  const commandInner = (
    <Box>
      <VLine
        strip={columnStrip(grid, 0, frame.commandBar.y, frame.commandBar.y)}
      />
      <Box width={innerWidth}>{renderCommandBar()}</Box>
      <VLine
        strip={columnStrip(
          grid,
          rightEdge,
          frame.commandBar.y,
          frame.commandBar.y,
        )}
      />
    </Box>
  );

  const fullRow = (y: number): React.ReactElement => (
    <CellRow cells={rowCells(grid, y, 0, rightEdge)} />
  );

  return (
    <Box flexDirection="column">
      {fullRow(topRow)}
      {headerInner}
      {fullRow(headerLineY)}
      {bodyBand}
      {fullRow(bottomLineY)}
      {commandInner}
      {fullRow(bottomRow)}
    </Box>
  );
}
