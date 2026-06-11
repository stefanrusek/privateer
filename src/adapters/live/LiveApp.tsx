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
import { LiveController } from './controller.js';

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
        visibleHeight={20}
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
        const series = controller.sessionSeries(detail.resource);
        return (
          <MetricsTab
            resourceKind={detail.resource.kind}
            resourceName={detail.resource.name}
            tier={snapshot.metrics.tier}
            capabilities={snapshot.metrics.capabilities}
            cpuSeries={series.cpu}
            memorySeries={series.memory}
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
        hasPrometheus={false}
        focused={app.focus === 'detail'}
        onClose={controller.closeDetail}
        onTabChange={controller.setDetailTab}
        renderTabContent={renderTabContent}
      />
    );
  };

  return (
    <Box flexDirection="column">
      <AppRoot
        state={app}
        callbacks={callbacks}
        contextFilter={controller.getContextFilter()}
        cursorKind={snapshot.cursorKind}
        inputText={snapshot.inputText}
        renderList={renderList}
        renderDetail={renderDetail}
      />
      {confirm !== null && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onConfirm={controller.confirmAccept}
          onCancel={controller.confirmCancel}
        />
      )}
      {snapshot.pfManagerOpen && (
        <PortForwardManager
          forwards={snapshot.portForwards.forwards}
          recents={snapshot.portForwards.recents}
          onStop={() => undefined}
          onRetry={() => undefined}
          onNewForward={() => undefined}
          onClose={() => undefined}
        />
      )}
    </Box>
  );
}
