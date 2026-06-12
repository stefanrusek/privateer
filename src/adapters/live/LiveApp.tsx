// LiveApp — Ink component binding LiveController state to the prop-driven
// views (coverage-excluded glue, Spec 08 §5.2).

import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppRoot, type AppRootCallbacks } from '../../ui/index.js';
import { ResourceTable } from '../../ui/components/ResourceTable.js';
import { DetailPane, type TabId } from '../../ui/components/DetailPane.js';
import { OverviewTab } from '../../ui/components/OverviewTab.js';
import { YamlTab } from '../../ui/components/YamlTab.js';
import { EventsTab } from '../../ui/components/EventsTab.js';
import { AgentTab } from '../../ui/components/AgentTab.js';
import { HealthDashboard } from '../../ui/components/HealthDashboard.js';
import { ConfirmDialog } from '../../ui/components/ConfirmDialog.js';
import { LogsTab } from '../../ui/components/LogsTab.js';
import { PortForwardManager } from '../../ui/components/PortForwardManager.js';
import { MetricsTab } from '../../ui/components/MetricsTab.js';
import { MouseProvider, useMouse } from '@zenobius/ink-mouse';
import { PickerOverlay } from '../../ui/components/PickerOverlay.js';
import { LiveController } from './controller.js';

/** Routes global mouse events into the controller's geometry hit-testing. */
function MouseRouter({ controller }: { controller: LiveController }): null {
  const { events } = useMouse();
  useEffect(() => {
    // ink-mouse turns on any-motion tracking (1003h), which we don't use —
    // motion events flood the stream and leak into the shell on unclean
    // exits. Click (1000h) + SGR (1006h) stay on; motion modes go off.
    process.stdout.write('\x1b[?1003l\x1b[?1015l');
    const onClick = (
      position: { x: number; y: number },
      action: 'press' | 'release' | null,
    ): void => {
      if (action === 'press') {
        controller.handleMouseClick(position.x, position.y);
      }
    };
    const onScroll = (
      position: { x: number; y: number },
      direction: 'scrollup' | 'scrolldown' | null,
    ): void => {
      if (direction !== null) {
        controller.handleMouseScroll(position.x, direction);
      }
    };
    events.on('click', onClick);
    events.on('scroll', onScroll);
    return () => {
      events.off('click', onClick);
      events.off('scroll', onScroll);
    };
  }, [controller, events]);
  return null;
}

export function LiveApp({
  controller,
}: {
  controller: LiveController;
}): React.ReactElement {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );

  // start() is idempotent; the controller intentionally survives unmounts
  // (exec suspend-and-handover remounts the tree). Disposal happens on quit.
  useEffect(() => {
    controller.start();
  }, [controller]);

  // Track terminal size so panes scroll instead of overflowing.
  useEffect(() => {
    const update = (): void => {
      const { columns, rows } = process.stdout as {
        columns?: number;
        rows?: number;
      };
      controller.setTerminalSize(columns ?? 80, rows ?? 24);
    };
    update();
    process.stdout.on('resize', update);
    return () => {
      process.stdout.off('resize', update);
    };
  }, [controller]);

  useInput((input, key) => {
    controller.handleInput(input, key);
  });

  const callbacks: AppRootCallbacks = useMemo(
    () => ({
      onSelectKind: controller.selectKind,
      onToggleCategory: controller.toggleCategory,
      onNamespaceChange: controller.setNamespace,
      onSearchChange: controller.setSearch,
      onContextSelect: controller.selectContext,
      onContextSwitcherClose: controller.closeContextSwitcher,
      onHelpClose: controller.closeHelp,
      onFocusChange: controller.setFocus,
    }),
    [controller],
  );

  const { app, table, columns, selectedIndex, detail, confirm, health } =
    snapshot;

  const renderList = (): React.ReactNode => {
    if (app.activeKind === 'Overview') {
      return (
        <HealthDashboard
          clusterName={app.context}
          summary={health.summary}
          rules={health.rules}
          showPassing={health.showPassing}
          metrics={controller.metricsOverview()}
          kafka={{
            detected: false,
            deploymentType: 'none',
            exporterAvailable: false,
            topics: [],
          }}
          onNavigateWarnings={() => {
            controller.navigateToPodsWithStatus('warning');
          }}
          onNavigateErrors={() => {
            controller.navigateToPodsWithStatus('error');
          }}
          onShowRule={() => undefined}
          onToggleShowPassing={controller.toggleShowPassing}
          onNavigateKafkaTopic={() => undefined}
        />
      );
    }
    if (table === null) {
      return <Text dimColor>Select a resource kind…</Text>;
    }
    return (
      <ResourceTable
        model={table}
        columns={columns}
        visibleHeight={controller.visibleHeight()}
        totalWidth={controller.tableWidth()}
        focused={app.focus === 'list'}
        nowMs={snapshot.nowMs}
        namespace={app.namespace === '' ? 'all namespaces' : app.namespace}
        selectedIndex={selectedIndex}
        onScrollDown={() => undefined}
        onScrollUp={() => undefined}
        onScrollToStart={() => undefined}
        onScrollToEnd={() => undefined}
        onPageDown={() => undefined}
        onPageUp={() => undefined}
      />
    );
  };

  const renderTabContent = (tab: TabId): React.ReactNode => {
    if (detail === null) {
      return null;
    }
    switch (tab) {
      case 'overview':
        return (
          <OverviewTab resource={detail.resource} nowMs={snapshot.nowMs} />
        );
      case 'yaml':
        return (
          <YamlTab
            resource={detail.resource.raw}
            kubeClient={controller.kubeClient()}
            clock={controller.systemClock()}
            onModeChange={controller.yamlModeChanged}
          />
        );
      case 'events':
        return (
          <EventsTab
            events={detail.events}
            warningCount={detail.warningCount}
            showAll={detail.showAllEvents}
            onToggleShowAll={controller.toggleShowAllEvents}
            nowMs={snapshot.nowMs}
          />
        );
      case 'logs': {
        const logs = snapshot.logs;
        if (logs === null) {
          return <Text dimColor>Logs are only available for pods.</Text>;
        }
        return (
          <LogsTab
            podName={logs.podName}
            container={logs.container}
            lines={logs.lines}
            live={logs.live}
            timestamps={logs.timestamps}
            wrap={logs.wrap}
            lineLimitLabel={logs.lineLimitLabel}
            previous={logs.previous}
            search={logs.search}
            searchFocused={logs.searchFocused}
            newLinesAvailable={logs.newLinesAvailable}
            {...(logs.confirmation !== undefined
              ? { confirmation: logs.confirmation }
              : {})}
          />
        );
      }
      case 'metrics': {
        const m = snapshot.metrics;
        const charts =
          m.tier === 'prometheus' && m.charts?.uid === detail.resource.uid
            ? m.charts
            : null;
        const session =
          charts === null ? controller.sessionSeries(detail.resource) : null;
        return (
          <MetricsTab
            resourceKind={detail.resource.kind}
            resourceName={detail.resource.name}
            tier={m.tier}
            capabilities={m.capabilities}
            cpuSeries={charts?.cpu ?? session?.cpu ?? []}
            memorySeries={charts?.memory ?? session?.memory ?? []}
            networkInSeries={charts?.networkIn ?? []}
            networkOutSeries={charts?.networkOut ?? []}
            restartSeries={charts?.restarts ?? []}
            replicaSeries={charts?.replicas ?? []}
            lagSeries={charts?.lag ?? []}
            rangeModel={m.range}
            onRangeChange={controller.setMetricsRange}
          />
        );
      }
      case 'agent':
        return (
          <AgentTab
            exchanges={snapshot.agentExchanges}
            onClearHistory={controller.clearAgentHistory}
          />
        );
    }
  };

  const renderDetail = (): React.ReactNode => {
    if (detail === null) {
      if (snapshot.agentPaneOpen) {
        return (
          <Box flexDirection="column">
            <Text bold>Agent</Text>
            <AgentTab
              exchanges={snapshot.agentExchanges}
              onClearHistory={controller.clearAgentHistory}
            />
          </Box>
        );
      }
      return null;
    }
    return (
      <DetailPane
        resource={detail.resource}
        activeTab={detail.tab}
        warningCount={detail.warningCount}
        hasPrometheus={snapshot.metrics.tier === 'prometheus'}
        focused={app.focus === 'detail'}
        onClose={controller.closeDetail}
        onTabChange={controller.setDetailTab}
        renderTabContent={renderTabContent}
      />
    );
  };

  const termSize = controller.terminalSize();
  const rows = termSize.rows;
  const termCols = termSize.columns;
  const contentRows = Math.max(8, rows - 3);
  // verticalRatio is the detail pane's share of the split (Spec 02 §6.1).
  const listRows = app.showDetail
    ? Math.max(4, Math.round(contentRows * (1 - app.verticalRatio)))
    : contentRows;
  const detailRows = Math.max(4, contentRows - listRows);

  if (snapshot.picker !== null) {
    return (
      <Box height={rows} width={termCols} overflow="hidden">
        <PickerOverlay
          title={snapshot.picker.title}
          items={snapshot.picker.items}
          selectedIndex={snapshot.picker.selectedIndex}
          filter={snapshot.picker.filter}
          maxRows={Math.max(6, rows - 8)}
        />
      </Box>
    );
  }

  if (snapshot.pfManagerOpen) {
    return (
      <Box height={rows} width={termCols} overflow="hidden">
        <PortForwardManager
          forwards={snapshot.portForwards.forwards}
          recents={snapshot.portForwards.recents}
          onStop={() => undefined}
          onRetry={() => undefined}
          onNewForward={() => undefined}
          onClose={() => undefined}
        />
      </Box>
    );
  }

  return (
    <MouseProvider>
      <MouseRouter controller={controller} />
      <Box
        height={rows}
        width={termCols}
        overflow="hidden"
        flexDirection="column"
      >
        <AppRoot
          state={app}
          callbacks={callbacks}
          terminalSize={controller.terminalSize()}
          contextFilter={controller.getContextFilter()}
          cursorKind={snapshot.cursorKind}
          inputText={snapshot.inputText}
          renderList={() => (
            <Box height={listRows} overflow="hidden" flexDirection="column">
              {renderList()}
            </Box>
          )}
          renderDetail={() => (
            <Box height={detailRows} overflow="hidden" flexDirection="column">
              {renderDetail()}
            </Box>
          )}
          {...(confirm !== null
            ? {
                commandBarContent: (
                  <ConfirmDialog
                    message={confirm.message}
                    confirmLabel={confirm.confirmLabel}
                    destructive={confirm.destructive}
                    onConfirm={controller.confirmAccept}
                    onCancel={controller.confirmCancel}
                  />
                ),
              }
            : {})}
        />
      </Box>
    </MouseProvider>
  );
}
