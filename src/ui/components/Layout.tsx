/**
 * Layout component — three-region split layout: sidebar | list + detail.
 * Spec 02 §4.
 */

import React from 'react';
import { Box } from 'ink';

export interface LayoutProps {
  sidebarWidth: number;
  verticalSplit: number;
  showDetail: boolean;
  renderSidebar: () => React.ReactNode;
  renderList: () => React.ReactNode;
  renderDetail: () => React.ReactNode;
  renderHeader: () => React.ReactNode;
  renderCommandBar: () => React.ReactNode;
}

export function Layout({
  sidebarWidth,
  verticalSplit: _verticalSplit,
  showDetail,
  renderSidebar,
  renderList,
  renderDetail,
  renderHeader,
  renderCommandBar,
}: LayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%">
      {/* Header row */}
      <Box>{renderHeader()}</Box>

      {/* Main content area */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Sidebar */}
        <Box width={sidebarWidth} flexDirection="column">
          {renderSidebar()}
        </Box>

        {/* List + optional detail */}
        <Box flexDirection="column" flexGrow={1}>
          {showDetail ? (
            <>
              <Box flexGrow={1}>{renderList()}</Box>
              <Box flexGrow={1}>{renderDetail()}</Box>
            </>
          ) : (
            <Box flexGrow={1}>{renderList()}</Box>
          )}
        </Box>
      </Box>

      {/* Command bar */}
      <Box>{renderCommandBar()}</Box>
    </Box>
  );
}
