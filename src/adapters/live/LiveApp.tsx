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

  useEffect(() => {
    controller.start();
    return () => {
      controller.dispose();
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
          metrics={null}
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
      case 'logs':
        return <Text dimColor>Log streaming is wired in a later phase.</Text>;
      case 'metrics':
        return <Text dimColor>No metrics source connected.</Text>;
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
    </Box>
  );
}
