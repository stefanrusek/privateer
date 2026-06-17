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
import {
  PortForwardManager,
  pfManagerRemeasureKey,
} from '../../ui/components/PortForwardManager.js';
import { MetricsTab } from '../../ui/components/MetricsTab.js';
import { PickerOverlay } from '../../ui/components/PickerOverlay.js';
import { LiveController } from './controller.js';
import {
  MeasuredRegistryProvider,
  Button,
  DropdownButton,
  OVERLAY_LAYER,
  type DropdownItem,
} from './measured-widgets.js';
import { LOGS_TOOLBAR_ACCELERATORS } from '../../ui/logs-toolbar.js';
import type { TabDef } from '../../ui/components/DetailPane.js';

/**
 * The single mouse path: one `process.stdin` listener feeds every raw read to
 * the controller, which splits it into SGR events and routes them through the
 * pure dispatcher. ink-mouse is gone — no second parser, no 1003h tug-of-war.
 * The controller's `MouseLifecycle` owns enabling reporting and the idempotent
 * teardown (also driven by quit/suspend/exit elsewhere).
 */
function MouseRouter({ controller }: { controller: LiveController }): null {
  useEffect(() => {
    const lifecycle = controller.mouseLifecycle();
    lifecycle.enable();
    const onData = (chunk: Buffer | string): void => {
      controller.handleStdinChunk(chunk.toString());
    };
    process.stdin.on('data', onData);
    return () => {
      process.stdin.off('data', onData);
      // Unmount happens on quit and on suspend/exec-handover; tear the modes
      // down here too. tearDown() is idempotent, so the belt-and-braces guards
      // in launch.adapter never double-write.
      lifecycle.tearDown();
    };
  }, [controller]);
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
          kafka={controller.kafkaSection()}
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
          <OverviewTab
            resource={detail.resource}
            nowMs={snapshot.nowMs}
            width={controller.detailScrollWidth()}
            offset={controller.detailScrollOffset()}
            viewportHeight={controller.detailScrollViewportHeight()}
          />
        );
      case 'yaml': {
        const reentry = controller.peekYamlEditReentry();
        return (
          <YamlTab
            yaml={controller.yamlForDetail()}
            kind={detail.resource.kind}
            title={controller.yamlTitle()}
            onReplace={controller.yamlReplace}
            onReload={controller.yamlReload}
            onOpenInEditor={controller.yamlOpenInEditor}
            onModeChange={controller.yamlModeChanged}
            {...(reentry !== null ? { reentryContent: reentry } : {})}
            onReentryConsumed={controller.clearYamlEditReentry}
            width={controller.detailScrollWidth()}
            offset={controller.detailScrollOffset()}
            viewportHeight={controller.detailScrollViewportHeight()}
            renderDiscardButton={({ which, label, selected, onClick }) => (
              <Button
                id={`yaml.discard.${which}`}
                label={`[${label}]`}
                // Register on the overlay layer (mirrors the delete
                // ConfirmDialog) so the discard `[Yes]`/`[No]` win the hit-test
                // over the YamlTab detail region beneath even if a future
                // higher-layer region is added — clicks always route to the
                // prompt, never the editor below it.
                layer={OVERLAY_LAYER}
                onClick={onClick}
                active={selected}
                color={which === 'confirm' ? 'red' : 'green'}
              />
            )}
          />
        );
      }
      case 'events':
        return (
          <EventsTab
            events={detail.events}
            warningCount={detail.warningCount}
            showAll={detail.showAllEvents}
            onToggleShowAll={controller.toggleShowAllEvents}
            nowMs={snapshot.nowMs}
            width={controller.detailScrollWidth()}
            offset={controller.detailScrollOffset()}
            viewportHeight={controller.detailScrollViewportHeight()}
          />
        );
      case 'logs': {
        const logs = snapshot.logs;
        if (logs === null) {
          return <Text dimColor>Logs are only available for pods.</Text>;
        }
        // B06: the toolbar's [Container ▾] / [NNN lines ▾] are measured
        // DropdownButtons (open state controlled by the controller so the `o`/`l`
        // accelerators and clicks share one source of truth); the toggles are
        // accelerator Buttons. Rendered inline inside the detail pane — never a
        // full-screen modal.
        const containerLabel = `Container${logs.previous ? ' (previous)' : ''}`;
        const logsToolbar = (
          <Box flexDirection="row" gap={1}>
            <DropdownButton
              id="logs.container"
              label={containerLabel}
              accelerator={LOGS_TOOLBAR_ACCELERATORS['logs.container']}
              items={logs.containerItems.map((it) => ({
                id: it.id,
                label: it.label,
              }))}
              selectedIndex={
                logs.containerPickerOpen
                  ? logs.containerPickerIndex
                  : logs.containerIndex
              }
              onSelect={controller.selectContainerByIndex}
              open={logs.containerPickerOpen}
              onOpenChange={controller.setContainerDropdownOpen}
            />
            <Button
              id="logs.pause"
              label={logs.live ? '● Live' : '○ Paused'}
              accelerator={LOGS_TOOLBAR_ACCELERATORS['logs.pause']}
              onClick={() => {
                controller.logsToolbarAction('logs.pause');
              }}
            />
            <Button
              id="logs.timestamps"
              label="Timestamps"
              accelerator={LOGS_TOOLBAR_ACCELERATORS['logs.timestamps']}
              onClick={() => {
                controller.logsToolbarAction('logs.timestamps');
              }}
            />
            <Button
              id="logs.wrap"
              label="Wrap"
              accelerator={LOGS_TOOLBAR_ACCELERATORS['logs.wrap']}
              onClick={() => {
                controller.logsToolbarAction('logs.wrap');
              }}
            />
            <DropdownButton
              id="logs.lineLimit"
              label={logs.lineLimitLabel}
              accelerator={LOGS_TOOLBAR_ACCELERATORS['logs.lineLimit']}
              items={logs.lineLimitItems.map((it) => ({
                id: it.id,
                label: it.label,
              }))}
              selectedIndex={
                logs.lineLimitOpen
                  ? logs.lineLimitPickerIndex
                  : logs.lineLimitIndex
              }
              onSelect={controller.selectLineLimitByIndex}
              open={logs.lineLimitOpen}
              onOpenChange={controller.setLineLimitDropdownOpen}
            />
            <Button
              id="logs.download"
              label="Download"
              accelerator={LOGS_TOOLBAR_ACCELERATORS['logs.download']}
              onClick={() => {
                controller.logsToolbarAction('logs.download');
              }}
            />
          </Box>
        );
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
            toolbar={logsToolbar}
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
            paneWidth={
              frame.detail !== null ? frame.detail.width : frame.list.width
            }
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
            offset={controller.detailScrollOffset()}
            viewportHeight={controller.detailScrollViewportHeight()}
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
        renderTabBar={renderTabBar}
      />
    );
  };

  // Measured detail tab bar (B04b): each tab + the ✕ close is a clickable
  // <Button>; the controller routes the registered buttonPress to these
  // handlers. The accelerator letter underlines the first matching label letter.
  const renderTabBar = (
    tabs: readonly TabDef[],
    activeTab: TabId,
  ): React.ReactNode => (
    <Box flexDirection="row" gap={1}>
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          id={`tab.${tab.id}`}
          label={`[${tab.label}]`}
          active={activeTab === tab.id}
          onClick={() => {
            controller.setDetailTab(tab.id);
          }}
        />
      ))}
      <Button
        id="detail.close"
        onClick={() => {
          controller.closeDetail();
        }}
      >
        <Text>✕</Text>
      </Button>
    </Box>
  );

  // Measured header (B04b): the context + search chips are plain <Button>s; the
  // namespace is a filterable <DropdownButton>. Clicking the context chip opens
  // the context switcher (chunk 08); the search chip focuses search.
  const namespaceItems: DropdownItem[] = app.allNamespaces.map((ns) => ({
    id: ns === '' ? '__all__' : ns,
    label: ns === '' ? 'all namespaces' : ns,
  }));
  const headerSlot = (
    <Box flexDirection="row">
      <Box marginRight={1}>
        <Button
          id="header.context"
          label={
            app.switchStatus?.phase === 'connecting'
              ? `… connecting to ${app.switchStatus.ctx}`
              : app.context
          }
          accelerator="c"
          onClick={controller.openContextSwitcher}
        />
      </Box>
      <Box marginRight={2} flexDirection="row">
        <Text>ns: </Text>
        <DropdownButton
          id="header.namespace"
          label={app.namespace === '' ? 'all' : app.namespace}
          items={namespaceItems}
          selectedIndex={Math.max(
            0,
            namespaceItems.findIndex(
              (it) =>
                it.id === (app.namespace === '' ? '__all__' : app.namespace),
            ),
          )}
          onSelect={(index) => {
            const chosen = namespaceItems[index];
            if (chosen !== undefined) {
              controller.setNamespace(chosen.id === '__all__' ? '' : chosen.id);
            }
          }}
          filterable
        />
      </Box>
      <Box flexGrow={1} justifyContent="flex-end">
        <Text>/</Text>
        <Button
          id="header.search"
          label={app.search}
          active={app.headerFocus === 'search'}
          onClick={() => {
            controller.setFocus('commandbar');
          }}
        />
      </Box>
    </Box>
  );

  // Command-bar override: a confirm dialog wins; otherwise a failed switch
  // shows the persistent "Could not connect" banner with [Retry] / [Switch
  // context] (chunk 08 §3). Both render inline in the command bar (Spec 04 §12).
  const switchError =
    app.switchStatus?.phase === 'error' ? app.switchStatus : null;
  const commandBarOverride: React.ReactNode =
    confirm !== null ? (
      <ConfirmDialog
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
        selection={confirm.selection}
        onConfirm={controller.confirmAccept}
        onCancel={controller.confirmCancel}
        renderButton={({ which, label, selected, destructive, onClick }) => (
          <Button
            id={`confirm.${which}`}
            label={`[${label}]`}
            layer={OVERLAY_LAYER}
            active={selected}
            onClick={onClick}
            {...(destructive ? { color: 'red' } : {})}
          />
        )}
      />
    ) : switchError !== null ? (
      <Box flexDirection="row">
        <Text color="red">
          ✗ Could not connect to {switchError.ctx}: {switchError.reason}
        </Text>
        <Box marginLeft={2}>
          <Button
            id="context.retry"
            label="Retry"
            accelerator="r"
            onClick={controller.retrySwitch}
          />
        </Box>
        <Box marginLeft={2}>
          <Button
            id="context.switch"
            label="Switch context"
            accelerator="c"
            onClick={controller.switchContextFromError}
          />
        </Box>
      </Box>
    ) : null;

  const termSize = controller.terminalSize();
  const rows = termSize.rows;
  const termCols = termSize.columns;
  // All region sizing derives from the single geometry source (Spec 02
  // §"Single source of truth"); LiveApp does no layout arithmetic of its own.
  const frame = controller.frame();
  const listRows = frame.list.height;
  const detailRows = frame.detail !== null ? frame.detail.height : 0;

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
    // Rendered inside the registry/mouse plumbing so the [✕]/[retry]/[New]/
    // [Close] controls are measured, clickable Buttons (C3); clicks are routed
    // through the controller's pfManagerRegistry.
    //
    // Every pfm Button shares one `remeasureKey` derived from the forwards'
    // ids/statuses/fail-reason (a failed row grows multi-line) and the recents
    // count: when forwards change *while the manager is open* they shift the
    // bottom-row `[New]`/`[Close]` (and later rows) down, and a Button whose
    // label/layer is unchanged would otherwise keep its stale registered rect
    // and miss clicks (the offset bug).
    const pfRemeasureKey = pfManagerRemeasureKey(snapshot.portForwards);
    return (
      <MeasuredRegistryProvider registry={controller}>
        <MouseRouter controller={controller} />
        <Box height={rows} width={termCols} overflow="hidden">
          <PortForwardManager
            forwards={snapshot.portForwards.forwards}
            recents={snapshot.portForwards.recents}
            selectedIndex={snapshot.pfSelectedIndex}
            onStop={controller.stopForward}
            onRetry={controller.retryForward}
            // `[+ New Forward]` closes the manager and opens the port picker
            // for the selected Pod (Spec 05 §5.4) — it must NOT just close the
            // manager (that was the mis-wired-to-closePfManager bug).
            onNewForward={controller.openNewForward}
            onClose={controller.closePfManager}
            renderButton={({ id, label, color, onClick }) => (
              <Button
                id={id}
                label={label}
                layer={OVERLAY_LAYER}
                onClick={onClick}
                remeasureKey={pfRemeasureKey}
                {...(color !== undefined ? { color } : {})}
              />
            )}
          />
        </Box>
      </MeasuredRegistryProvider>
    );
  }

  return (
    <MeasuredRegistryProvider registry={controller}>
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
          headerSlot={headerSlot}
          detailTab={snapshot.detail?.tab ?? null}
          helpScroll={controller.getHelpScroll()}
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
          {...(commandBarOverride !== null
            ? { commandBarContent: commandBarOverride }
            : {})}
        />
      </Box>
    </MeasuredRegistryProvider>
  );
}
