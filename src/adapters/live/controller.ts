// LiveController — production composition layer (coverage-excluded glue,
// Spec 08 §5.2). Connects kubeconfig → KubeClientAdapter → StreamManager →
// StateStore → UI snapshot consumed by the Ink views. All decision logic is
// delegated to the covered pure modules (table model, fast-path, commands,
// health registry, rollups); this class only routes events and holds state.

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { KubeConfig } from '@kubernetes/client-node';
import type { LaunchOptions } from '../../cli/args.js';
import type { KubeError } from '../../boundaries/kube-client.js';
import type { ResourceEvent, ResourceObject } from '../../core/types.js';
import type { AppState, FocusRegion } from '../../ui/types.js';
import type { TableModel } from '../../ui/resource-table-model.js';
import type { ColumnDef } from '../../resources/columns.js';
import type { TabId } from '../../ui/components/DetailPane.js';
import type { EventRow } from '../../ui/components/EventsTab.js';
import type { ClusterSummary } from '../../ui/components/HealthDashboard.js';
import type { EvaluatedRule } from '../../health/types.js';
import type { AgentExchange } from '../../ui/components/AgentTab.js';
import type { AgentAction } from '../../command/action.js';
import {
  createTableModel,
  applyResourceEvent,
  tickAnimations,
  getSortedFilteredRows,
  applySearch,
  scrollDown,
  scrollUp,
} from '../../ui/resource-table-model.js';
import { getColumns } from '../../resources/columns.js';
import { initialAppState } from '../../cli/initial-state.js';
import { normalize } from '../../resources/normalize.js';
import { StateStore } from '../../store/state-store.js';
import { StreamManager } from '../../k8s/stream-manager.js';
import { evaluateAllRules } from '../../health/registry.js';
import { EMPTY_CAPS } from '../../health/types.js';
import {
  SIDEBAR_CATEGORIES,
  flattenSidebarNav,
} from '../../ui/sidebar-data.js';
import { useEventsFetcher } from '../../ui/components/EventsTab.js';
import { parseBangCommand } from '../../command/commands.js';
import { parseFastPath } from '../../command/fast-path.js';
import { executeAction } from '../../command/executor.js';
import { runLoop } from '../../agent/loop.js';
import {
  buildSystemPrompt,
  buildToolDefinitions,
  type PromptContext,
} from '../../agent/prompt.js';
import { parseConfig } from '../../config/schema.js';
import { AgentToolDispatcher } from '../../agent/dispatcher.js';
import { humanizeToolCall } from '../../agent/progress.js';
import type {
  InferenceEngine,
  ChatMessage,
} from '../../boundaries/inference-engine.js';
import { TransformersInferenceEngine } from '../inference-engine.adapter.js';
import { RingBuffer } from '../../logs/ring-buffer.js';
import {
  buildContainerPicker,
  type ContainerOption,
} from '../../logs/container-picker.js';
import {
  emptySearch,
  runSearch,
  nextMatch,
  prevMatch,
  type SearchState,
} from '../../logs/search.js';
import {
  LINE_OPTIONS,
  DEFAULT_LINE_OPTION,
  findLineOption,
  streamParamsFor,
  type LineOptionId,
} from '../../logs/line-options.js';
import { downloadLogs } from '../../logs/download.js';
import { PortForwardManager } from '../../portforward/manager.js';
import type { PortForwardManagerState } from '../../portforward/manager.js';
import {
  discoverMetricsSource,
  type MetricsTier,
} from '../../metrics/discovery.js';
import {
  detectExporterCapabilities,
  type ExporterCapabilities,
} from '../../metrics/exporters.js';
import {
  SessionBuffer,
  type ResourceKey,
} from '../../metrics/session-buffer.js';
import { renderSessionSparkline } from '../../charts/sparkline.js';
import type { MetricSeries } from '../../boundaries/metrics-source.js';
import { PrometheusHttpAdapter } from '../metrics-source.adapter.js';
import {
  MetricsServerAdapter,
  parseCpuMillicores as parseCpuQuantity,
  parseMemoryBytes as parseMemQuantity,
} from '../metrics-server.adapter.js';
import { KubeClientAdapter } from '../kube-client.adapter.js';
import { LogStreamAdapter } from '../log-stream.adapter.js';
import {
  SystemClock,
  SubprocessRunner,
  SystemLifecycle,
  FsFileSink,
  FsConfigStore,
} from '../system.adapter.js';
import { join } from 'node:path';
import {
  labelToKind,
  kindToLabel,
  CORE_KINDS,
  CLUSTER_SCOPED_KINDS,
  LABEL_TO_KIND,
} from './kinds.js';

// ---------------------------------------------------------------------------
// Snapshot types consumed by LiveApp
// ---------------------------------------------------------------------------

export interface DetailState {
  uid: string;
  resource: ResourceObject;
  tab: TabId;
  events: EventRow[];
  warningCount: number;
  showAllEvents: boolean;
  yamlMode: 'read' | 'edit' | 'discard-confirm' | 'diff';
}

export interface ConfirmState {
  message: string;
  destructive: boolean;
  confirmLabel: string;
  action: () => void;
}

export interface HealthState {
  summary: ClusterSummary;
  rules: EvaluatedRule[];
  showPassing: boolean;
}

/** Display-ready logs view state consumed by LogsTab. */
export interface LogsViewState {
  podName: string;
  container: string;
  lines: readonly string[];
  live: boolean;
  timestamps: boolean;
  wrap: boolean;
  lineLimitLabel: string;
  previous: boolean;
  search: SearchState;
  searchFocused: boolean;
  newLinesAvailable: boolean;
  confirmation: string | undefined;
}

/** Inline port-forward prompt state (Spec 05 §5.2). */
export interface PortPromptState {
  podName: string;
  namespace: string;
  text: string;
}

/** Metrics state exposed to the views (Spec 06). */
export interface MetricsViewState {
  tier: MetricsTier;
  capabilities: ExporterCapabilities;
}

export interface LiveSnapshot {
  app: AppState;
  cursorKind: string;
  inputText: string;
  table: TableModel | null;
  columns: ColumnDef[];
  selectedIndex: number;
  detail: DetailState | null;
  confirm: ConfirmState | null;
  health: HealthState;
  agentExchanges: readonly AgentExchange[];
  logs: LogsViewState | null;
  portForwards: PortForwardManagerState;
  pfManagerOpen: boolean;
  agentPaneOpen: boolean;
  portPrompt: PortPromptState | null;
  metrics: MetricsViewState;
  nowMs: number;
}

/** Key shape Ink passes to useInput handlers. */
export interface InkKey {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
}

const GG_WINDOW_MS = 500;
const TICK_MS = 1000;
const ANIMATION_TICK_MS = 250;
const HEALTH_INTERVAL_MS = 60_000;
const BADGE_INTERVAL_MS = 60_000;
const VISIBLE_HEIGHT = 20;

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class LiveController {
  private readonly kc: KubeConfig;
  private client: KubeClientAdapter;
  private readonly clock = new SystemClock();
  private store: StateStore;
  private streams: StreamManager | null = null;

  private app: AppState;
  private cursorKind = 'Overview';
  private inputText = '';
  private commandOpen = false;
  private table: TableModel | null = null;
  private columns: ColumnDef[] = [];
  private selectedIndex = 0;
  private detail: DetailState | null = null;
  private confirm: ConfirmState | null = null;
  private health: HealthState = {
    summary: emptySummary(),
    rules: [],
    showPassing: false,
  };
  private agentExchanges: AgentExchange[] = [];
  private contextFilter = '';
  private namespacePickIndex = 0;

  // Logs (Spec 05 §3)
  private logs: {
    podName: string;
    namespace: string;
    container: string;
    containers: ContainerOption[];
    ring: RingBuffer;
    live: boolean;
    timestamps: boolean;
    wrap: boolean;
    limit: LineOptionId;
    previous: boolean;
    searchQuery: string;
    searchCurrent: number;
    searchFocused: boolean;
    newLines: number;
    confirmation: string | undefined;
    stop: (() => void) | null;
  } | null = null;
  private logsBumpScheduled = false;

  // Port-forwards (Spec 05 §5)
  private readonly pf = new PortForwardManager(
    new SubprocessRunner(),
    new SystemLifecycle(),
  );
  private pfManagerOpen = false;
  private portPrompt: PortPromptState | null = null;
  private agentPaneOpen = false;

  // Exec suspend/handover (Spec 05 §4.3): set by the launch adapter.
  private suspendRunner: (run: () => Promise<void>) => void = () => undefined;

  // Metrics (Spec 06): discovery tier + session buffer for the
  // metrics-server fallback (40-sample rolling window per pod/node).
  private metricsTier: MetricsTier = 'none';
  private metricsCaps: ExporterCapabilities = {
    cadvisor: false,
    kubeStateMetrics: false,
    kafkaExporter: false,
    strimziJmx: false,
  };
  private prometheus: PrometheusHttpAdapter | null = null;
  private metricsServer: MetricsServerAdapter | null = null;
  private readonly sessions = new SessionBuffer();

  private readonly fileSink = new FsFileSink();
  private started = false;

  // Agent (Spec 07): engine loads lazily in the background after launch.
  private enginePromise: Promise<InferenceEngine> | null = null;
  private agentTimeoutMs = 15_000;

  private pendingG: number | null = null;
  private listeners = new Set<() => void>();
  private snapshot: LiveSnapshot | null = null;
  private cancels: (() => void)[] = [];
  private healthDebounce: (() => void) | null = null;
  private readonly noAgent: boolean;
  private readonly onExit: () => void;

  constructor(options: LaunchOptions, onExit: () => void) {
    this.onExit = onExit;
    this.noAgent = options.noAgent;
    this.kc = new KubeConfig();
    if (options.kubeconfig !== undefined) {
      this.kc.loadFromFile(options.kubeconfig);
    } else {
      this.kc.loadFromDefault();
    }
    if (options.context !== undefined) {
      this.kc.setCurrentContext(options.context);
    }
    this.client = new KubeClientAdapter(this.kc);
    this.store = new StateStore((event) => normalize(event.object));
    this.app = initialAppState({
      context: this.kc.getCurrentContext(),
      namespace: options.namespace ?? '',
      contexts: this.client.listContexts().map((c) => c.name),
      namespaces: [],
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  setSuspendRunner(runner: (run: () => Promise<void>) => void): void {
    this.suspendRunner = runner;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.pf.onChange(() => {
      this.bump();
    });
    this.startStreams();

    // Age refresh + animation ticks
    this.cancels.push(
      this.clock.setInterval(() => {
        if (this.table !== null) {
          const ticked = tickAnimations(this.table, this.clock.now());
          if (ticked !== this.table) {
            this.table = ticked;
          }
        }
        this.bump();
      }, TICK_MS),
    );
    this.cancels.push(
      this.clock.setInterval(() => {
        if (this.table !== null) {
          const ticked = tickAnimations(this.table, this.clock.now());
          if (ticked !== this.table) {
            this.table = ticked;
            this.bump();
          }
        }
      }, ANIMATION_TICK_MS),
    );

    // Health re-evaluation
    this.cancels.push(
      this.clock.setInterval(() => {
        this.evaluateHealth();
      }, HEALTH_INTERVAL_MS),
    );

    // Config-driven agent timeout (Spec 07 §9 default 15s; slower hardware
    // can raise it via agent.timeoutSeconds in ~/.config/p9r/config.yaml).
    void new FsConfigStore(join(homedir(), '.config', 'p9r', 'config.yaml'))
      .load()
      .then((result) => {
        if (result.ok) {
          this.agentTimeoutMs =
            parseConfig(result.value).agentTimeoutSeconds * 1000;
        }
      });

    // Metrics discovery + polling (Spec 06 §2)
    void this.initMetrics();

    // Badge sweep for on-demand kinds
    void this.badgeSweep();
    this.cancels.push(
      this.clock.setInterval(() => {
        void this.badgeSweep();
      }, BADGE_INTERVAL_MS),
    );

    // Store-driven refresh (coalesced by StateStore into microtasks)
    this.store.subscribe(() => {
      this.onStoreChanged();
    });
  }

  dispose(): void {
    this.streams?.stop();
    this.healthDebounce?.();
    this.healthDebounce = null;
    for (const cancel of this.cancels) {
      cancel();
    }
    this.cancels = [];
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSnapshot => {
    this.snapshot ??= {
      app: this.appWithIndicators(),
      cursorKind: this.cursorKind,
      inputText: this.commandBarText(),
      table: this.table,
      columns: this.columns,
      selectedIndex: this.selectedIndex,
      detail: this.detail,
      confirm: this.confirm,
      health: this.health,
      agentExchanges: this.agentExchanges,
      logs: this.buildLogsView(),
      portForwards: this.pf.getState(),
      pfManagerOpen: this.pfManagerOpen,
      portPrompt: this.portPrompt,
      agentPaneOpen: this.agentPaneOpen,
      metrics: { tier: this.metricsTier, capabilities: this.metricsCaps },
      nowMs: this.clock.now(),
    };
    return this.snapshot;
  };

  private appWithIndicators(): AppState {
    const active = this.pf
      .getState()
      .forwards.filter((f) => f.status !== 'failed').length;
    if (active === 0) {
      return this.app;
    }
    return {
      ...this.app,
      hints: [`⇄ ${String(active)}`, ...this.app.hints],
    };
  }

  private commandBarText(): string {
    if (this.portPrompt !== null) {
      return `⇄ ${this.portPrompt.podName} ports remote:local = ${this.portPrompt.text}`;
    }
    return this.commandOpen ? this.inputText : '';
  }

  /** Lines shown at once in the logs tab (LogsTab renders all it is given). */
  private static readonly LOGS_VIEW_LINES = 200;

  private buildLogsView(): LogsViewState | null {
    if (this.logs === null) {
      return null;
    }
    const l = this.logs;
    const raw = l.ring.toArray();
    const tail = raw.slice(-LiveController.LOGS_VIEW_LINES);
    const display = l.timestamps
      ? tail
      : tail.map((line) => {
          const space = line.indexOf(' ');
          return space > 0 ? line.slice(space + 1) : line;
        });
    const base =
      l.searchQuery === '' ? emptySearch() : runSearch(display, l.searchQuery);
    const search: SearchState =
      base.matches.length === 0
        ? base
        : {
            ...base,
            current: Math.min(
              Math.max(l.searchCurrent, 0),
              base.matches.length - 1,
            ),
          };
    return {
      podName: l.podName,
      container: l.container,
      lines: display,
      live: l.live,
      timestamps: l.timestamps,
      wrap: l.wrap,
      lineLimitLabel: findLineOption(l.limit)?.buttonLabel ?? l.limit,
      previous: l.previous,
      search,
      searchFocused: l.searchFocused,
      newLinesAvailable: l.newLines > 0,
      confirmation: l.confirmation,
    };
  }

  getContextFilter(): string {
    return this.contextFilter;
  }

  kubeClient(): KubeClientAdapter {
    return this.client;
  }

  systemClock(): SystemClock {
    return this.clock;
  }

  private bump(): void {
    this.snapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
  }

  // -------------------------------------------------------------------------
  // Streams / store
  // -------------------------------------------------------------------------

  private startStreams(): void {
    if (process.env.P9R_DEBUG !== undefined) {
      process.stderr.write('[streams] starting\n');
    }
    this.streams = new StreamManager(
      this.client,
      this.clock,
      (event) => {
        this.onResourceEvent(event);
      },
      (kind, error) => {
        this.onStreamError(kind, error);
      },
      (kind, count) => {
        this.setBadge(kindToLabel(kind), count, true);
      },
    );
    this.streams.start();
  }

  private onResourceEvent(event: ResourceEvent): void {
    if (process.env.P9R_DEBUG !== undefined) {
      process.stderr.write(
        `[stream] ${event.type} ${event.kind}/${event.name}\n`,
      );
    }
    this.store.applyEvent(this.app.context, event);

    const kind = event.object.kind ?? event.kind;
    const activeKind =
      this.app.activeKind === 'Overview'
        ? null
        : labelToKind(this.app.activeKind);

    if (this.table !== null && kind === activeKind) {
      if (this.matchesNamespaceFilter(event.namespace, kind)) {
        const resource = normalize(event.object);
        this.table = applyResourceEvent(
          this.table,
          { type: event.type, resource },
          this.clock.now(),
        );
        this.clampSelection();
      }
    }

    // Live-update the open detail resource
    if (this.detail !== null && event.type !== 'DELETED') {
      const resource = normalize(event.object);
      if (resource.uid === this.detail.uid) {
        this.detail = { ...this.detail, resource };
      }
    }
  }

  private onStoreChanged(): void {
    // Coalesced refresh: badges for core kinds, namespaces, health summary.
    this.refreshNamespaces();
    this.refreshCoreBadges();
    this.healthDebounce ??= this.clock.setTimeout(() => {
      this.healthDebounce = null;
      this.evaluateHealth();
    }, 2000);
    this.bump();
  }

  private refreshNamespaces(): void {
    const namespaces = this.store
      .list(this.app.context, 'Namespace')
      .map((r) => r.name)
      .sort();
    if (namespaces.join(',') !== this.app.allNamespaces.join(',')) {
      this.app = { ...this.app, allNamespaces: namespaces };
    }
  }

  private refreshCoreBadges(): void {
    const counts = new Map(this.app.badgeCounts);
    for (const kind of CORE_KINDS) {
      const all = this.store.list(this.app.context, kind);
      const filtered =
        this.app.namespace === '' || CLUSTER_SCOPED_KINDS.has(kind)
          ? all
          : all.filter((r) => r.namespace === this.app.namespace);
      counts.set(kindToLabel(kind), filtered.length);
    }
    this.app = { ...this.app, badgeCounts: counts };
  }

  private setBadge(label: string, count: number, dimmed: boolean): void {
    const counts = new Map(this.app.badgeCounts);
    counts.set(label, count);
    const dimmedKinds = new Set(this.app.dimmedKinds);
    if (dimmed) {
      dimmedKinds.add(label);
    } else {
      dimmedKinds.delete(label);
    }
    this.app = { ...this.app, badgeCounts: counts, dimmedKinds };
    this.bump();
  }

  private async badgeSweep(): Promise<void> {
    for (const [label, kind] of LABEL_TO_KIND) {
      if (CORE_KINDS.has(kind)) {
        continue;
      }
      const result = await this.client.list(kind, { limit: 1 });
      if (process.env.P9R_DEBUG !== undefined) {
        process.stderr.write(
          `[badge] ${kind}: ${result.ok ? 'ok' : result.error.kind + ' ' + result.error.message}\n`,
        );
      }
      if (result.ok) {
        const count =
          result.value.items.length + (result.value.remainingItemCount ?? 0);
        this.setBadge(label, count, true);
      } else if (result.error.kind === 'forbidden') {
        const forbidden = new Set(this.app.forbiddenKinds);
        forbidden.add(label);
        this.app = { ...this.app, forbiddenKinds: forbidden };
        this.bump();
      }
    }
  }

  private onStreamError(kind: string, error: KubeError): void {
    if (process.env.P9R_DEBUG !== undefined) {
      process.stderr.write(
        `[stream-err] ${kind}: ${error.kind} ${error.message}\n`,
      );
    }
    const label = kindToLabel(kind === 'WarningEvents' ? 'Event' : kind);
    if (error.kind === 'forbidden') {
      const forbidden = new Set(this.app.forbiddenKinds);
      forbidden.add(label);
      this.app = { ...this.app, forbiddenKinds: forbidden };
      if (this.table !== null && labelToKind(this.app.activeKind) === kind) {
        this.table = { ...this.table, loadState: 'forbidden' };
      }
    } else {
      const dimmed = new Set(this.app.dimmedKinds);
      dimmed.add(label);
      this.app = { ...this.app, dimmedKinds: dimmed };
    }
    this.bump();
  }

  private matchesNamespaceFilter(
    namespace: string | null,
    kind: string,
  ): boolean {
    if (this.app.namespace === '' || CLUSTER_SCOPED_KINDS.has(kind)) {
      return true;
    }
    return namespace === this.app.namespace;
  }

  // -------------------------------------------------------------------------
  // Metrics (Spec 06)
  // -------------------------------------------------------------------------

  private async initMetrics(): Promise<void> {
    const configStore = new FsConfigStore(
      join(homedir(), '.config', 'p9r', 'config.yaml'),
    );
    const msAdapter = new MetricsServerAdapter(this.kc);
    const result = await discoverMetricsSource({
      configStore,
      kubeClient: this.client,
      makeSource: (url) => new PrometheusHttpAdapter(url),
      metricsServerSource: msAdapter,
      getEnv: (name) => process.env[name],
    });
    this.metricsTier = result.tier;
    if (result.tier === 'prometheus' && result.url !== null) {
      this.prometheus = new PrometheusHttpAdapter(result.url);
      this.metricsCaps = await detectExporterCapabilities(this.prometheus);
    } else if (result.tier === 'metrics-server') {
      this.metricsServer = msAdapter;
      // Under metrics-server, CPU/memory charts render from the session
      // buffer; the cadvisor capability gates exactly those charts.
      this.metricsCaps = {
        cadvisor: true,
        kubeStateMetrics: false,
        kafkaExporter: false,
        strimziJmx: false,
      };
      void this.pollMetricsServer();
      this.cancels.push(
        this.clock.setInterval(() => {
          void this.pollMetricsServer();
        }, 30_000),
      );
    }
    // Refresh table columns so sparklines appear for the active kind.
    if (this.app.activeKind !== 'Overview') {
      this.columns = this.columnsForKind(
        labelToKind(this.app.activeKind) ?? '',
      );
    }
    this.bump();
  }

  private async pollMetricsServer(): Promise<void> {
    const ms = this.metricsServer;
    if (ms === null) {
      return;
    }
    const now = this.clock.now();
    const [pods, nodes] = await Promise.all([
      ms.fetchPodUsage(),
      ms.fetchNodeUsage(),
    ]);
    if (pods.ok) {
      for (const sample of pods.value) {
        this.sessions.push(
          { kind: 'Pod', namespace: sample.namespace, name: sample.name },
          {
            timestampMs: now,
            cpuMillicores: sample.cpuMillicores,
            memoryBytes: sample.memoryBytes,
          },
        );
      }
    }
    if (nodes.ok) {
      for (const sample of nodes.value) {
        this.sessions.push(
          { kind: 'Node', namespace: null, name: sample.name },
          {
            timestampMs: now,
            cpuMillicores: sample.cpuMillicores,
            memoryBytes: sample.memoryBytes,
          },
        );
      }
    }
    this.bump();
  }

  /** Columns for a kind, with CPU/Memory sparklines when metrics flow. */
  private columnsForKind(kind: string): ColumnDef[] {
    const base = getColumns(kind);
    if (
      this.metricsTier === 'none' ||
      (kind !== 'Pod' && kind !== 'Node') ||
      this.metricsServer === null
    ) {
      return base;
    }
    const sessions = this.sessions;
    const sparklineCol = (
      header: string,
      pick: (cpu: number, mem: number) => number,
      maxFor: (key: ResourceKey) => number,
    ): ColumnDef => ({
      header,
      width: 12,
      accessor: (raw): string => {
        const key: ResourceKey = {
          kind,
          namespace: raw.metadata?.namespace ?? null,
          name: raw.metadata?.name ?? '',
        };
        const samples = sessions.getSamples(key);
        if (samples.length === 0) {
          return '';
        }
        const values = samples.map((s) => pick(s.cpuMillicores, s.memoryBytes));
        return renderSessionSparkline(values, maxFor(key)).text;
      },
    });
    const maxOf = (values: number[]): number =>
      values.reduce((a, b) => Math.max(a, b), 0) * 1.25 || 1;
    return [
      ...base,
      sparklineCol(
        'CPU',
        (cpu) => cpu,
        (key) => maxOf(sessions.getSamples(key).map((s) => s.cpuMillicores)),
      ),
      sparklineCol(
        'Memory',
        (_cpu, mem) => mem,
        (key) => maxOf(sessions.getSamples(key).map((s) => s.memoryBytes)),
      ),
    ];
  }

  /** Session-buffer series for the metrics tab (metrics-server tier). */
  sessionSeries(resource: ResourceObject): {
    cpu: MetricSeries[];
    memory: MetricSeries[];
  } {
    if (resource.kind !== 'Pod' && resource.kind !== 'Node') {
      return { cpu: [], memory: [] };
    }
    const key: ResourceKey = {
      kind: resource.kind,
      namespace: resource.namespace,
      name: resource.name,
    };
    const samples = this.sessions.getSamples(key);
    if (samples.length === 0) {
      return { cpu: [], memory: [] };
    }
    return {
      cpu: [
        {
          labels: { resource: resource.name, metric: 'cpu' },
          points: samples.map((s) => ({
            timestampMs: s.timestampMs,
            value: s.cpuMillicores,
          })),
        },
      ],
      memory: [
        {
          labels: { resource: resource.name, metric: 'memory' },
          points: samples.map((s) => ({
            timestampMs: s.timestampMs,
            value: s.memoryBytes,
          })),
        },
      ],
    };
  }

  /** Cluster-wide CPU/memory overview for the health dashboard (Spec 06 §5). */
  metricsOverview(): {
    prometheusConnected: boolean;
    cpuSparkline: string;
    cpuAvgPct: number;
    memSparkline: string;
    memAvgPct: number;
  } | null {
    if (this.metricsTier === 'none') {
      return null;
    }
    const nodes = this.store.list(this.app.context, 'Node');
    if (nodes.length === 0) {
      return null;
    }
    // Sum usage across nodes per sample index; compare to allocatable totals.
    let allocCpu = 0;
    let allocMem = 0;
    const perNodeSamples = nodes.map((node) => {
      const raw = node.raw as {
        status?: { allocatable?: { cpu?: string; memory?: string } };
      };
      allocCpu += parseCpuQuantity(raw.status?.allocatable?.cpu ?? '0');
      allocMem += parseMemQuantity(raw.status?.allocatable?.memory ?? '0');
      return this.sessions.getSamples({
        kind: 'Node',
        namespace: null,
        name: node.name,
      });
    });
    const maxLen = perNodeSamples.reduce((a, s) => Math.max(a, s.length), 0);
    if (maxLen === 0 || allocCpu === 0 || allocMem === 0) {
      return null;
    }
    const cpuPcts: number[] = [];
    const memPcts: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      let cpu = 0;
      let mem = 0;
      for (const samples of perNodeSamples) {
        const sample = samples[samples.length - maxLen + i];
        if (sample !== undefined) {
          cpu += sample.cpuMillicores;
          mem += sample.memoryBytes;
        }
      }
      cpuPcts.push((cpu / allocCpu) * 100);
      memPcts.push((mem / allocMem) * 100);
    }
    return {
      prometheusConnected: this.metricsTier === 'prometheus',
      cpuSparkline: renderSessionSparkline(cpuPcts, 100).text,
      cpuAvgPct: Math.round(cpuPcts[cpuPcts.length - 1] ?? 0),
      memSparkline: renderSessionSparkline(memPcts, 100).text,
      memAvgPct: Math.round(memPcts[memPcts.length - 1] ?? 0),
    };
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  private evaluateHealth(): void {
    const ctx = this.app.context;
    const pods = this.store.list(ctx, 'Pod');
    const nodes = this.store.list(ctx, 'Node');
    const namespaces = this.store.list(ctx, 'Namespace');
    const summary: ClusterSummary = {
      podsRunning: pods.filter((p) => p.status.color === 'green').length,
      warnings: pods.filter((p) => p.status.color === 'yellow').length,
      errors: pods.filter((p) => p.status.color === 'red').length,
      pending: pods.filter((p) => p.status.color === 'grey').length,
      nodesReady: nodes.filter((n) => n.status.color === 'green').length,
      nodesTotal: nodes.length,
      namespaceCount: namespaces.length,
    };
    const rules = evaluateAllRules(this.store, ctx, EMPTY_CAPS);
    this.health = { ...this.health, summary, rules };
    this.bump();
  }

  // -------------------------------------------------------------------------
  // Table management
  // -------------------------------------------------------------------------

  private seedTable(kindLabel: string): void {
    const kind = labelToKind(kindLabel);
    if (kind === undefined) {
      this.table = null;
      this.columns = [];
      return;
    }
    this.columns = this.columnsForKind(kind);
    let model = createTableModel(kind);
    model = applySearch(model, this.app.search);
    const now = this.clock.now();
    const resources = this.store
      .list(this.app.context, kind)
      .filter((r) => this.matchesNamespaceFilter(r.namespace, kind));
    for (const resource of resources) {
      model = applyResourceEvent(
        model,
        { type: 'ADDED', resource },
        now - 10_000,
      );
    }
    model = tickAnimations(model, now);
    // If the watch has already delivered data the table is ready even when
    // empty; only show the loading state when the stream is still warming up.
    if (resources.length > 0 || this.storeHasKind(kind)) {
      model = { ...model, loadState: 'ready' };
    }
    this.table = model;
    this.selectedIndex = 0;
    this.streams?.activate(kind);
    if (!CORE_KINDS.has(kind)) {
      void this.listSeed(kind);
    }
  }

  /**
   * Initial LIST for an on-demand kind so the table reaches a ready state
   * immediately (the watch then keeps it current).
   */
  private async listSeed(kind: string): Promise<void> {
    const result = await this.client.list(kind, {});
    if (this.table?.kind !== kind) {
      return;
    }
    if (!result.ok) {
      if (result.error.kind === 'forbidden') {
        this.table = { ...this.table, loadState: 'forbidden' };
      } else {
        this.table = { ...this.table, loadState: 'connection-error' };
      }
      this.bump();
      return;
    }
    const now = this.clock.now();
    for (const item of result.value.items) {
      const event: ResourceEvent = {
        type: 'ADDED',
        apiVersion: item.apiVersion ?? '',
        kind: item.kind ?? kind,
        namespace: item.metadata?.namespace ?? null,
        name: item.metadata?.name ?? '',
        object: { ...item, kind: item.kind ?? kind },
        receivedAt: now,
      };
      this.store.applyEvent(this.app.context, event);
      if (this.matchesNamespaceFilter(event.namespace, kind)) {
        const resource = normalize(event.object);
        this.table = applyResourceEvent(
          this.table,
          { type: 'ADDED', resource },
          now - 10_000,
        );
      }
    }
    this.table = tickAnimations(this.table, now);
    this.table = { ...this.table, loadState: 'ready' };
    this.clampSelection();
    this.bump();
  }

  private storeHasKind(kind: string): boolean {
    // Core kinds are watched from startup — treat as ready once streams run.
    return (
      CORE_KINDS.has(kind) || this.store.list(this.app.context, kind).length > 0
    );
  }

  private clampSelection(): void {
    if (this.table === null) {
      this.selectedIndex = 0;
      return;
    }
    const rows = getSortedFilteredRows(this.table);
    this.selectedIndex = Math.max(
      0,
      Math.min(this.selectedIndex, rows.length - 1),
    );
  }

  private selectedRow(): ResourceObject | null {
    if (this.table === null) {
      return null;
    }
    const rows = getSortedFilteredRows(this.table);
    return rows[this.selectedIndex]?.resource ?? null;
  }

  // -------------------------------------------------------------------------
  // Public UI callbacks (wired into AppRoot / components)
  // -------------------------------------------------------------------------

  selectKind = (kindLabel: string): void => {
    this.app = { ...this.app, activeKind: kindLabel, search: '' };
    this.detail = null;
    this.stopLogs();
    this.app = { ...this.app, showDetail: false };
    if (kindLabel === 'Overview') {
      this.table = null;
      this.columns = [];
      this.evaluateHealth();
    } else {
      this.seedTable(kindLabel);
    }
    this.bump();
  };

  toggleCategory = (cat: string): void => {
    const collapsed = new Set(this.app.collapsedCategories);
    if (collapsed.has(cat)) {
      collapsed.delete(cat);
    } else {
      collapsed.add(cat);
    }
    this.app = { ...this.app, collapsedCategories: collapsed };
    this.bump();
  };

  setNamespace = (namespace: string): void => {
    this.app = { ...this.app, namespace };
    if (this.app.activeKind !== 'Overview') {
      this.seedTable(this.app.activeKind);
    }
    this.refreshCoreBadges();
    this.bump();
  };

  setSearch = (search: string): void => {
    this.app = { ...this.app, search };
    if (this.table !== null) {
      this.table = applySearch(this.table, search);
      this.clampSelection();
    }
    this.bump();
  };

  setFocus = (focus: FocusRegion): void => {
    this.app = { ...this.app, focus };
    this.bump();
  };

  setDetailTab = (tab: TabId): void => {
    if (this.detail !== null) {
      this.detail = { ...this.detail, tab };
      if (tab === 'logs' && this.detail.resource.kind === 'Pod') {
        this.initLogs(this.detail.resource);
      }
      this.bump();
    }
  };

  closeDetail = (): void => {
    this.detail = null;
    this.agentPaneOpen = false;
    this.stopLogs();
    this.app = { ...this.app, showDetail: false, focus: 'list' };
    this.bump();
  };

  yamlModeChanged = (mode: DetailState['yamlMode']): void => {
    if (this.detail !== null) {
      this.detail = { ...this.detail, yamlMode: mode };
      this.app = { ...this.app, mode: mode === 'read' ? 'normal' : 'edit' };
      this.bump();
    }
  };

  toggleShowAllEvents = (): void => {
    if (this.detail !== null) {
      this.detail = {
        ...this.detail,
        showAllEvents: !this.detail.showAllEvents,
      };
      void this.fetchDetailEvents();
      this.bump();
    }
  };

  toggleShowPassing = (): void => {
    this.health = { ...this.health, showPassing: !this.health.showPassing };
    this.bump();
  };

  confirmCancel = (): void => {
    this.confirm = null;
    this.bump();
  };

  confirmAccept = (): void => {
    const action = this.confirm?.action;
    this.confirm = null;
    this.bump();
    action?.();
  };

  selectContext = (ctx: string): void => {
    this.app = { ...this.app, contextSwitcherOpen: false };
    this.contextFilter = '';
    if (ctx !== this.app.context) {
      this.switchContext(ctx);
    }
    this.bump();
  };

  closeContextSwitcher = (): void => {
    this.contextFilter = '';
    this.app = { ...this.app, contextSwitcherOpen: false };
    this.bump();
  };

  closeHelp = (): void => {
    this.app = { ...this.app, helpOpen: false };
    this.bump();
  };

  clearAgentHistory = (): void => {
    this.agentExchanges = [];
    this.bump();
  };

  navigateToPodsWithStatus = (_status: 'warning' | 'error'): void => {
    this.selectKind('Pods');
  };

  // -------------------------------------------------------------------------
  // Context switching (Spec 01 §6 — tear down streams, reinitialize)
  // -------------------------------------------------------------------------

  private switchContext(ctx: string): void {
    this.streams?.stop();
    this.kc.setCurrentContext(ctx);
    this.client = new KubeClientAdapter(this.kc);
    this.store = new StateStore((event) => normalize(event.object));
    this.store.subscribe(() => {
      this.onStoreChanged();
    });
    this.app = {
      ...this.app,
      context: ctx,
      namespace: '',
      allNamespaces: [],
      badgeCounts: new Map(),
      dimmedKinds: new Set(),
      forbiddenKinds: new Set(),
      activeKind: 'Overview',
      showDetail: false,
    };
    this.detail = null;
    this.stopLogs();
    this.table = null;
    this.health = { summary: emptySummary(), rules: [], showPassing: false };
    this.startStreams();
    void this.badgeSweep();
  }

  // -------------------------------------------------------------------------
  // Detail pane
  // -------------------------------------------------------------------------

  private openDetail(resource: ResourceObject, tab: TabId): void {
    this.detail = {
      uid: resource.uid,
      resource,
      tab,
      events: [],
      warningCount: 0,
      showAllEvents: false,
      yamlMode: 'read',
    };
    if (tab === 'logs' && resource.kind === 'Pod') {
      this.initLogs(resource);
    } else {
      this.stopLogs();
    }
    this.app = { ...this.app, showDetail: true, focus: 'detail' };
    void this.fetchDetailEvents();
    this.bump();
  }

  private async fetchDetailEvents(): Promise<void> {
    if (this.detail === null) {
      return;
    }
    const { resource, showAllEvents } = this.detail;
    const result = await useEventsFetcher({
      kubeClient: this.client,
      resourceName: resource.name,
      resourceKind: resource.kind,
      namespace: resource.namespace ?? '',
      showAll: showAllEvents,
      nowMs: this.clock.now(),
    });
    this.applyDetailEvents(resource.uid, result.events, result.warningCount);
  }

  private applyDetailEvents(
    uid: string,
    events: EventRow[],
    warningCount: number,
  ): void {
    if (this.detail?.uid !== uid) {
      return;
    }
    this.detail = { ...this.detail, events, warningCount };
    this.bump();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  private requestDelete(resource: ResourceObject): void {
    const scaleNote =
      resource.kind === 'Deployment' || resource.kind === 'StatefulSet'
        ? ' This will remove the deployment and all its pods.'
        : '';
    this.confirm = {
      message: `Delete ${resource.kind} ${resource.name}?${scaleNote}`,
      destructive: true,
      confirmLabel: 'Delete',
      action: () => {
        void this.client
          .delete(resource.kind, resource.name, resource.namespace)
          .then((result) => {
            if (!result.ok) {
              this.setHints([`✗ Delete failed: ${result.error.message}`]);
            }
          });
      },
    };
    this.bump();
  }

  private copyNameToClipboard(resource: ResourceObject): void {
    if (process.platform === 'darwin') {
      try {
        const child = spawn('pbcopy');
        child.stdin.write(resource.name);
        child.stdin.end();
        this.setHints([`✓ Copied ${resource.name}`]);
      } catch {
        // Clipboard unavailable — non-fatal.
      }
    }
  }

  private setHints(hints: string[]): void {
    this.app = { ...this.app, hints };
    this.bump();
  }

  // -------------------------------------------------------------------------
  // Command bar (agent + bang commands)
  // -------------------------------------------------------------------------

  private submitCommandBar(): void {
    const text = this.inputText.trim();
    this.commandOpen = false;
    this.inputText = '';
    this.app = { ...this.app, mode: 'normal', focus: 'list' };
    if (text.length === 0) {
      this.bump();
      return;
    }

    const bang = parseBangCommand(
      text.startsWith('!') ? text : this.noAgent ? `!${text}` : text,
    );
    if (bang !== null) {
      this.runBangCommand(bang);
      return;
    }

    this.runAgentQuery(text);
  }

  private runBangCommand(
    bang: NonNullable<ReturnType<typeof parseBangCommand>>,
  ): void {
    switch (bang.kind) {
      case 'ctx':
        this.app = { ...this.app, contextSwitcherOpen: true };
        break;
      case 'ns':
        this.setNamespace(bang.namespace);
        break;
      case 'quit':
        this.quit();
        break;
      case 'navigate':
        this.applyAgentAction(bang.action);
        break;
      case 'unknown':
        this.setHints([`✗ Unknown command: ${bang.raw}`]);
        break;
    }
    this.bump();
  }

  private runAgentQuery(text: string): void {
    const fast = parseFastPath(text, new Set(this.app.allNamespaces));
    if (fast !== null) {
      this.agentExchanges = [
        ...this.agentExchanges,
        { query: text, action: fast },
      ].slice(-20);
      this.applyAgentAction(fast);
      this.bump();
      return;
    }

    if (this.noAgent) {
      this.agentExchanges = [
        ...this.agentExchanges,
        {
          query: text,
          action: {
            action: 'unknown' as const,
            raw: 'Agent disabled (--no-agent). Try a direct phrase like "pods in kube-system" or a !command.',
          },
        },
      ].slice(-20);
      this.openAgentTab();
      this.bump();
      return;
    }

    // Model-backed inference (Spec 07 §9)
    this.agentExchanges = [
      ...this.agentExchanges,
      { query: text, action: null, pending: true },
    ].slice(-20);
    this.setHints(['> thinking…']);
    void this.runInference(text);
  }

  /** Resolve the local inference engine, loading it on first use. */
  private ensureEngine(): Promise<InferenceEngine> {
    this.enginePromise ??= TransformersInferenceEngine.create();
    return this.enginePromise;
  }

  /**
   * Tool subset exposed to the model. Each tool schema costs ~100 prompt
   * tokens per round and any tool round-trip doubles the rounds — on this
   * hardware (8GB, WebGPU at ~1-6 tok/s) that busts the 15s budget, so the
   * model answers from the cluster summary in the system prompt instead.
   * On faster hardware, widen this set (the dispatcher supports the full
   * catalog and is exercised by the BDD suite).
   */
  private static readonly AGENT_TOOLS = new Set<string>([]);

  /**
   * Preload the engine in the background and run a tiny warmup generation so
   * the WebGPU kernels are compiled before the first real query.
   */
  preloadEngine(): void {
    if (this.noAgent) {
      return;
    }
    // Loading the ONNX model concurrently with the initial watch
    // connections starves them permanently in the compiled binary — wait
    // until the streams are established before pulling the model in.
    this.clock.setTimeout(() => {
      this.reallyPreloadEngine();
    }, 8000);
  }

  private reallyPreloadEngine(): void {
    void this.ensureEngine()
      .then((engine) => {
        if (process.env.P9R_DEBUG !== undefined) {
          process.stderr.write('[engine] loaded\n');
        }
        return engine.generate({
          messages: [{ role: 'user', content: 'Reply with the word ok.' }],
          tools: [],
          thinking: false,
        });
      })
      .then(() => {
        if (process.env.P9R_DEBUG !== undefined) {
          process.stderr.write('[engine] warmup done\n');
        }
      })
      .catch((e: unknown) => {
        if (process.env.P9R_DEBUG !== undefined) {
          process.stderr.write(`[engine] failed: ${String(e)}\n`);
        }
      });
  }

  private async runInference(text: string): Promise<void> {
    let engine: InferenceEngine;
    try {
      engine = await this.ensureEngine();
    } catch (e) {
      this.finishExchange(text, null, `Model failed to load: ${String(e)}`);
      return;
    }

    const promptCtx: PromptContext = {
      activeContext: this.app.context,
      activeNamespace: this.app.namespace === '' ? null : this.app.namespace,
      activeResourceKind: this.app.activeKind,
      healthIssues: this.health.rules
        .filter(
          (r) => r.result.status === 'error' || r.result.status === 'warn',
        )
        .slice(0, 5)
        .map((r) => ({
          severity:
            r.result.status === 'error'
              ? ('error' as const)
              : ('warn' as const),
          title: r.rule.title(r.result),
        })),
      kafkaClusters: [],
      allResourceKinds: [...LABEL_TO_KIND.values()],
    };
    const system = buildSystemPrompt(promptCtx, this.store);

    // Last 3 exchanges as history (Spec 07 §3.3), then the new query.
    const history: ChatMessage[] = [];
    for (const exchange of this.agentExchanges.slice(-4, -1)) {
      if (exchange.pending === true) {
        continue;
      }
      history.push({ role: 'user', content: exchange.query });
      const answer =
        exchange.action?.action === 'answer'
          ? exchange.action.text
          : JSON.stringify(exchange.action ?? {});
      history.push({ role: 'assistant', content: answer });
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: text },
    ];

    if (process.env.P9R_DEBUG !== undefined) {
      const total = messages.reduce((a, m) => a + m.content.length, 0);
      process.stderr.write(
        `[agent] system=${String(system.length)}ch total=${String(total)}ch (~${String(Math.round(total / 4))} tokens)\n`,
      );
    }
    const t0 = this.clock.now();
    const result = await runLoop({
      engine,
      dispatcher: new AgentToolDispatcher(
        this.store,
        this.app.context,
        this.clock.now(),
      ),
      clock: this.clock,
      messages,
      // Spec 07 / review C1 enables thinking (shouldThink) for diagnostics,
      // but on this hardware the reasoning budget cannot fit the 15s
      // timeout — force-off until a faster device is detected.
      thinking: false,
      onToolCall: (toolName, params) => {
        this.setHints([`> ${humanizeToolCall(toolName, params)}`]);
      },
      tools: buildToolDefinitions().filter((tool) =>
        LiveController.AGENT_TOOLS.has(tool.name),
      ),
      timeoutMs: this.agentTimeoutMs,
    });

    if (process.env.P9R_DEBUG !== undefined) {
      process.stderr.write(
        `[agent] result=${result.kind} in ${String(this.clock.now() - t0)}ms\n`,
      );
    }
    switch (result.kind) {
      case 'action':
        this.finishExchange(text, result.action, undefined);
        this.applyAgentAction(result.action);
        break;
      case 'timeout':
        this.finishExchange(
          text,
          null,
          'Query timed out. The model took too long to respond. Try a simpler query.',
        );
        break;
      case 'error':
        this.finishExchange(text, null, result.message);
        break;
      case 'parseError':
        this.finishExchange(
          text,
          null,
          "I couldn't understand the model's response. Try rephrasing your query.",
        );
        break;
    }
  }

  private finishExchange(
    query: string,
    action: AgentAction | null,
    errorMessage: string | undefined,
  ): void {
    this.agentExchanges = this.agentExchanges.map((exchange) =>
      exchange.query === query && exchange.pending === true
        ? {
            query,
            action,
            ...(errorMessage !== undefined ? { errorMessage } : {}),
          }
        : exchange,
    );
    this.setHints(['Space agent', '/ search', '? help', 'q quit']);
    if (action === null || action.action === 'answer') {
      this.openAgentTab();
    }
    this.bump();
  }

  protected applyAgentAction(action: AgentAction): void {
    const intent = executeAction(
      {
        kind: this.app.activeKind,
        namespace: this.app.namespace,
        search: this.app.search,
      },
      action,
    );
    const label = kindToLabel(intent.kind);
    if (label !== this.app.activeKind) {
      this.selectKind(label);
    }
    if (intent.namespace !== this.app.namespace) {
      this.setNamespace(intent.namespace);
    }
    if (intent.search !== this.app.search) {
      this.setSearch(intent.search);
    }
    if (action.action === 'answer' || action.action === 'unknown') {
      this.openAgentTab();
    }
  }

  private openAgentTab(): void {
    if (this.detail !== null) {
      this.detail = { ...this.detail, tab: 'agent' };
      this.app = { ...this.app, showDetail: true };
      return;
    }
    const resource = this.selectedRow();
    if (resource !== null) {
      this.openDetail(resource, 'agent');
      return;
    }
    // No selection (e.g. Overview): show the agent pane standalone.
    this.agentPaneOpen = true;
    this.app = { ...this.app, showDetail: true, focus: 'detail' };
  }

  private quit(): void {
    const active = this.pf
      .getState()
      .forwards.filter((f) => f.status !== 'failed').length;
    if (active > 0) {
      this.confirm = {
        message: `${String(active)} port-forward${active === 1 ? '' : 's'} active. Quit anyway?`,
        destructive: false,
        confirmLabel: 'Quit',
        action: () => {
          this.forceQuit();
        },
      };
      this.bump();
      return;
    }
    this.forceQuit();
  }

  private forceQuit(): void {
    for (const fwd of this.pf.getState().forwards) {
      this.pf.stop(fwd.id);
    }
    this.stopLogs();
    this.dispose();
    this.onExit();
  }

  // -------------------------------------------------------------------------
  // Logs (Spec 05 §3)
  // -------------------------------------------------------------------------

  private initLogs(resource: ResourceObject): void {
    if (
      this.logs !== null &&
      this.logs.podName === resource.name &&
      this.logs.namespace === (resource.namespace ?? '')
    ) {
      return;
    }
    this.stopLogs();
    const picker = buildContainerPicker(resource.raw);
    const idx = picker.defaultIndex >= 0 ? picker.defaultIndex : 0;
    const container = picker.options[idx]?.name;
    if (container === undefined) {
      this.logs = null;
      return;
    }
    this.logs = {
      podName: resource.name,
      namespace: resource.namespace ?? '',
      container,
      containers: picker.options,
      ring: new RingBuffer(10_000),
      live: true,
      timestamps: true,
      wrap: false,
      limit: DEFAULT_LINE_OPTION,
      previous: false,
      searchQuery: '',
      searchCurrent: 0,
      searchFocused: false,
      newLines: 0,
      confirmation: undefined,
      stop: null,
    };
    this.startLogStream();
  }

  private startLogStream(): void {
    const l = this.logs;
    if (l === null) {
      return;
    }
    l.stop?.();
    l.ring = new RingBuffer(10_000);
    l.newLines = 0;
    const adapter = new LogStreamAdapter(this.kc);
    const params = streamParamsFor(l.limit);
    l.stop = adapter.tail(
      {
        namespace: l.namespace,
        pod: l.podName,
        container: l.container,
        previous: l.previous,
        ...(params.tailLines !== undefined
          ? { tailLines: params.tailLines }
          : {}),
        ...(params.sinceSeconds !== undefined
          ? { sinceSeconds: params.sinceSeconds }
          : {}),
      },
      {
        onLine: (line) => {
          const l2 = this.logs;
          if (l2 === null) {
            return;
          }
          l2.ring.push(line);
          if (!l2.live) {
            l2.newLines++;
          }
          this.scheduleLogsBump();
        },
        onError: (error) => {
          const l2 = this.logs;
          if (l2 === null || error.kind === 'closed') {
            return;
          }
          l2.confirmation = `✗ ${error.message}`;
          this.bump();
        },
      },
    );
    this.bump();
  }

  private scheduleLogsBump(): void {
    if (this.logsBumpScheduled) {
      return;
    }
    this.logsBumpScheduled = true;
    this.cancels.push(
      this.clock.setTimeout(() => {
        this.logsBumpScheduled = false;
        if (this.logs?.live === true) {
          this.bump();
        }
      }, 150),
    );
  }

  private stopLogs(): void {
    if (this.logs !== null) {
      this.logs.stop?.();
      this.logs = null;
    }
  }

  /**
   * Handle keys while the logs tab is active and the detail pane is focused.
   * Returns true when the key was consumed.
   */
  private handleLogsInput(input: string, key: InkKey): boolean {
    const l = this.logs;
    if (l === null) {
      return false;
    }

    if (l.searchFocused) {
      if (key.escape) {
        l.searchQuery = '';
        l.searchFocused = false;
        this.bump();
        return true;
      }
      if (key.return) {
        l.searchFocused = false;
        this.bump();
        return true;
      }
      if (key.backspace || key.delete) {
        l.searchQuery = l.searchQuery.slice(0, -1);
        l.searchCurrent = 0;
        this.bump();
        return true;
      }
      if (input.length >= 1 && !key.ctrl && !key.meta) {
        l.searchQuery += input;
        l.searchCurrent = 0;
        this.bump();
        return true;
      }
      return true;
    }

    if (input === '/') {
      l.searchFocused = true;
      this.bump();
      return true;
    }
    if (input === 'n' && l.searchQuery !== '') {
      const view = this.buildLogsView();
      if (view !== null) {
        l.searchCurrent = nextMatch(view.search).current;
        this.bump();
      }
      return true;
    }
    if (input === 'N' && l.searchQuery !== '') {
      const view = this.buildLogsView();
      if (view !== null) {
        l.searchCurrent = prevMatch(view.search).current;
        this.bump();
      }
      return true;
    }
    if (input === 'p') {
      l.live = !l.live;
      if (l.live) {
        l.newLines = 0;
      }
      this.bump();
      return true;
    }
    if (input === 't') {
      l.timestamps = !l.timestamps;
      this.bump();
      return true;
    }
    if (input === 'w') {
      l.wrap = !l.wrap;
      this.bump();
      return true;
    }
    if (input === 'P') {
      const hasPrevious = l.containers.some(
        (c) => c.name === l.container && c.hasPrevious,
      );
      if (hasPrevious || l.previous) {
        l.previous = !l.previous;
        this.startLogStream();
      }
      return true;
    }
    if (input === 'L') {
      const ids = LINE_OPTIONS.map((o) => o.id);
      const next = ids[(ids.indexOf(l.limit) + 1) % ids.length];
      l.limit = next ?? DEFAULT_LINE_OPTION;
      this.startLogStream();
      return true;
    }
    if (input === 'c' && l.containers.length > 1) {
      const names = l.containers.map((c) => c.name);
      const next = names[(names.indexOf(l.container) + 1) % names.length];
      l.container = next ?? l.container;
      this.startLogStream();
      return true;
    }
    if (input === 'D') {
      void this.downloadCurrentLogs();
      return true;
    }
    return false;
  }

  private async downloadCurrentLogs(): Promise<void> {
    const l = this.logs;
    if (l === null) {
      return;
    }
    const result = await downloadLogs(
      this.fileSink,
      homedir(),
      l.podName,
      l.container,
      l.ring.toArray(),
      this.clock.now(),
    );
    const l2 = this.logs;
    if (l2 === null) {
      return;
    }
    l2.confirmation = result.ok
      ? `✓ Saved to ${result.value.displayPath}`
      : `✗ ${result.error.kind}`;
    this.bump();
  }

  // -------------------------------------------------------------------------
  // Exec (Spec 05 §4.3 — suspend-and-handover via kubectl subprocess)
  // -------------------------------------------------------------------------

  private execPod(resource: ResourceObject): void {
    const picker = buildContainerPicker(resource.raw);
    const idx = picker.defaultIndex >= 0 ? picker.defaultIndex : 0;
    const container = picker.options[idx]?.name;
    if (container === undefined) {
      this.setHints(['✗ No running container to exec into']);
      return;
    }
    const namespace = resource.namespace ?? 'default';
    const podName = resource.name;
    this.suspendRunner(
      () =>
        new Promise<void>((resolve) => {
          const child = spawn(
            'kubectl',
            [
              'exec',
              '-it',
              '-n',
              namespace,
              podName,
              '-c',
              container,
              '--',
              'sh',
              '-c',
              'command -v bash >/dev/null 2>&1 && exec bash || exec sh',
            ],
            { stdio: 'inherit' },
          );
          child.on('exit', () => {
            resolve();
          });
          child.on('error', () => {
            resolve();
          });
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Port-forward (Spec 05 §5)
  // -------------------------------------------------------------------------

  private openPortPrompt(resource: ResourceObject): void {
    const raw = resource.raw as {
      spec?: { containers?: { ports?: { containerPort?: number }[] }[] };
    };
    const port = raw.spec?.containers?.[0]?.ports?.[0]?.containerPort ?? 8080;
    this.portPrompt = {
      podName: resource.name,
      namespace: resource.namespace ?? 'default',
      text: `${String(port)}:${String(port)}`,
    };
    this.app = { ...this.app, focus: 'commandbar', mode: 'command' };
    this.bump();
  }

  private handlePortPromptInput(input: string, key: InkKey): void {
    const prompt = this.portPrompt;
    if (prompt === null) {
      return;
    }
    if (key.escape) {
      this.portPrompt = null;
      this.app = { ...this.app, focus: 'list', mode: 'normal' };
      this.bump();
      return;
    }
    if (key.return) {
      const parts = prompt.text.split(/[:\s]+/).filter((p) => p.length > 0);
      const remote = Number(parts[0] ?? '');
      const local = Number(parts[1] ?? parts[0] ?? '');
      this.portPrompt = null;
      this.app = { ...this.app, focus: 'list', mode: 'normal' };
      if (
        Number.isInteger(remote) &&
        remote > 0 &&
        Number.isInteger(local) &&
        local > 0
      ) {
        this.pf.start({
          podName: prompt.podName,
          namespace: prompt.namespace,
          remotePort: remote,
          localPort: local,
        });
        this.setHints([
          `⇄ Forwarding localhost:${String(local)} → ${prompt.podName}:${String(remote)}`,
        ]);
      } else {
        this.setHints(['✗ Invalid ports — expected remote:local']);
      }
      this.bump();
      return;
    }
    if (key.backspace || key.delete) {
      prompt.text = prompt.text.slice(0, -1);
      this.bump();
      return;
    }
    if (input.length >= 1 && !key.ctrl && !key.meta) {
      prompt.text += input;
      this.bump();
    }
  }

  private handlePfManagerInput(input: string, key: InkKey): void {
    if (key.escape || input === 'F') {
      this.pfManagerOpen = false;
      this.bump();
      return;
    }
    const digit = Number(input);
    if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
      const fwd = this.pf.getState().forwards[digit - 1];
      if (fwd !== undefined) {
        if (fwd.status === 'failed') {
          this.pf.retry(fwd.id);
        } else {
          this.pf.stop(fwd.id);
        }
        this.bump();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Keyboard routing
  // -------------------------------------------------------------------------

  handleInput(input: string, key: InkKey): void {
    // Ctrl+C is handled by Ink's exitOnCtrlC; q routing below.
    if (this.confirm !== null) {
      // ConfirmDialog's own useInput handles selection.
      return;
    }
    if (this.portPrompt !== null) {
      this.handlePortPromptInput(input, key);
      return;
    }
    if (this.pfManagerOpen) {
      this.handlePfManagerInput(input, key);
      return;
    }
    if (this.app.helpOpen) {
      if (input === '?' || key.escape) {
        this.closeHelp();
      }
      return;
    }
    if (this.app.contextSwitcherOpen) {
      this.handleContextSwitcherInput(input, key);
      return;
    }
    if (this.app.headerFocus === 'namespace') {
      this.handleNamespacePicker(input, key);
      return;
    }
    if (this.app.mode === 'search') {
      this.handleSearchInput(input, key);
      return;
    }
    if (this.commandOpen) {
      this.handleCommandInput(input, key);
      return;
    }
    if (this.app.mode === 'edit') {
      // YamlTab owns input during edit/diff/discard flows.
      return;
    }

    // Logs tab consumes its own keys while the detail pane is focused.
    if (
      this.app.focus === 'detail' &&
      this.detail?.tab === 'logs' &&
      this.handleLogsInput(input, key)
    ) {
      return;
    }

    // Normal mode — global keys
    if (input === 'F') {
      this.pfManagerOpen = true;
      this.bump();
      return;
    }
    if (input === 'q' && this.app.focus !== 'detail') {
      this.quit();
      return;
    }
    if (input === '?') {
      this.app = { ...this.app, helpOpen: true };
      this.bump();
      return;
    }
    if (input === '/') {
      this.app = { ...this.app, mode: 'search', headerFocus: 'search' };
      this.bump();
      return;
    }
    if (input === 'n') {
      this.namespacePickIndex = Math.max(
        0,
        ['', ...this.app.allNamespaces].indexOf(this.app.namespace),
      );
      this.app = { ...this.app, headerFocus: 'namespace' };
      this.bump();
      return;
    }
    if (input === ' ') {
      this.commandOpen = true;
      this.inputText = '';
      this.app = { ...this.app, mode: 'command', focus: 'commandbar' };
      this.bump();
      return;
    }
    if (input === '!') {
      this.commandOpen = true;
      this.inputText = '!';
      this.app = { ...this.app, mode: 'command', focus: 'commandbar' };
      this.bump();
      return;
    }
    if (key.tab && this.app.focus !== 'detail') {
      this.cycleFocus(key.shift);
      return;
    }
    if (input === 'r') {
      if (this.app.activeKind === 'Overview') {
        this.evaluateHealth();
      } else {
        this.seedTable(this.app.activeKind);
      }
      this.bump();
      return;
    }

    switch (this.app.focus) {
      case 'sidebar':
        this.handleSidebarInput(input, key);
        return;
      case 'list':
        this.handleListInput(input, key);
        return;
      case 'detail':
        this.handleDetailInput(input, key);
        return;
      case 'commandbar':
        return;
    }
  }

  private cycleFocus(reverse: boolean): void {
    const order: FocusRegion[] = this.app.showDetail
      ? ['sidebar', 'list', 'detail']
      : ['sidebar', 'list'];
    const idx = order.indexOf(this.app.focus);
    const next =
      order[
        (idx + (reverse ? order.length - 1 : 1) + order.length) % order.length
      ] ?? 'sidebar';
    this.setFocus(next);
  }

  private handleContextSwitcherInput(input: string, key: InkKey): void {
    if (key.escape) {
      this.closeContextSwitcher();
      return;
    }
    if (key.return) {
      const filtered = this.app.allContexts.filter((c) =>
        c.toLowerCase().includes(this.contextFilter.toLowerCase()),
      );
      const pick = filtered[0];
      if (pick !== undefined) {
        this.selectContext(pick);
      }
      return;
    }
    if (key.backspace || key.delete) {
      this.contextFilter = this.contextFilter.slice(0, -1);
      this.bump();
      return;
    }
    if (input.length >= 1 && !key.ctrl && !key.meta) {
      this.contextFilter += input;
      this.bump();
    }
  }

  private handleNamespacePicker(input: string, key: InkKey): void {
    const options = ['', ...this.app.allNamespaces];
    if (key.escape || key.return) {
      this.app = { ...this.app, headerFocus: null };
      this.bump();
      return;
    }
    if (key.downArrow || input === 'j') {
      this.namespacePickIndex = (this.namespacePickIndex + 1) % options.length;
      this.setNamespace(options[this.namespacePickIndex] ?? '');
      this.app = { ...this.app, headerFocus: 'namespace' };
      this.bump();
      return;
    }
    if (key.upArrow || input === 'k') {
      this.namespacePickIndex =
        (this.namespacePickIndex + options.length - 1) % options.length;
      this.setNamespace(options[this.namespacePickIndex] ?? '');
      this.app = { ...this.app, headerFocus: 'namespace' };
      this.bump();
    }
  }

  private handleSearchInput(input: string, key: InkKey): void {
    if (key.escape) {
      this.setSearch('');
      this.app = { ...this.app, mode: 'normal', headerFocus: null };
      this.bump();
      return;
    }
    if (key.return) {
      this.app = {
        ...this.app,
        mode: 'normal',
        headerFocus: null,
        focus: 'list',
      };
      this.bump();
      return;
    }
    if (key.backspace || key.delete) {
      this.setSearch(this.app.search.slice(0, -1));
      return;
    }
    if (input.length >= 1 && !key.ctrl && !key.meta) {
      this.setSearch(this.app.search + input);
    }
  }

  private handleCommandInput(input: string, key: InkKey): void {
    if (key.escape) {
      this.commandOpen = false;
      this.inputText = '';
      this.app = { ...this.app, mode: 'normal', focus: 'list' };
      this.bump();
      return;
    }
    if (key.return) {
      this.submitCommandBar();
      return;
    }
    if (key.backspace || key.delete) {
      this.inputText = this.inputText.slice(0, -1);
      this.bump();
      return;
    }
    if (input.length >= 1 && !key.ctrl && !key.meta) {
      this.inputText += input;
      this.bump();
    }
  }

  private handleSidebarInput(input: string, key: InkKey): void {
    const entries = flattenSidebarNav(
      SIDEBAR_CATEGORIES,
      this.app.collapsedCategories,
    );
    const keys = entries.map((e) =>
      e.type === 'overview'
        ? 'Overview'
        : e.type === 'category'
          ? e.id
          : e.resourceKind,
    );
    let idx = keys.indexOf(this.cursorKind);
    if (idx < 0) {
      idx = 0;
    }

    if (key.downArrow || input === 'j') {
      idx = Math.min(idx + 1, keys.length - 1);
      this.cursorKind = keys[idx] ?? 'Overview';
      this.bump();
      return;
    }
    if (key.upArrow || input === 'k') {
      idx = Math.max(idx - 1, 0);
      this.cursorKind = keys[idx] ?? 'Overview';
      this.bump();
      return;
    }
    const entry = entries[idx];
    if (entry === undefined) {
      return;
    }
    if (key.return || key.rightArrow) {
      if (entry.type === 'category') {
        if (key.return) {
          this.toggleCategory(entry.id);
        } else if (this.app.collapsedCategories.has(entry.id)) {
          this.toggleCategory(entry.id);
        }
      } else if (entry.type === 'overview') {
        this.selectKind('Overview');
        this.setFocus('list');
      } else {
        this.selectKind(entry.resourceKind);
        this.setFocus('list');
      }
      return;
    }
    if (key.leftArrow) {
      if (
        entry.type === 'category' &&
        !this.app.collapsedCategories.has(entry.id)
      ) {
        this.toggleCategory(entry.id);
      }
      return;
    }
    if (input === 'h') {
      const all = new Set(SIDEBAR_CATEGORIES.map((c) => c.id));
      this.app = { ...this.app, collapsedCategories: all };
      this.bump();
      return;
    }
    if (input === 'l') {
      this.app = { ...this.app, collapsedCategories: new Set() };
      this.bump();
    }
  }

  private handleListInput(input: string, key: InkKey): void {
    if (this.app.activeKind === 'Overview') {
      return;
    }
    if (this.table === null) {
      return;
    }
    const rows = getSortedFilteredRows(this.table);

    if (key.downArrow || input === 'j') {
      this.selectedIndex = Math.min(this.selectedIndex + 1, rows.length - 1);
      this.ensureVisible();
      this.bump();
      return;
    }
    if (key.upArrow || input === 'k') {
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.ensureVisible();
      this.bump();
      return;
    }
    if (input === 'g') {
      const now = this.clock.now();
      if (this.pendingG !== null && now - this.pendingG < GG_WINDOW_MS) {
        this.pendingG = null;
        this.selectedIndex = 0;
        this.ensureVisible();
        this.bump();
      } else {
        this.pendingG = now;
      }
      return;
    }
    if (input === 'G') {
      this.selectedIndex = Math.max(0, rows.length - 1);
      this.ensureVisible();
      this.bump();
      return;
    }
    if (key.ctrl && input === 'f') {
      this.selectedIndex = Math.min(
        this.selectedIndex + VISIBLE_HEIGHT,
        Math.max(0, rows.length - 1),
      );
      this.ensureVisible();
      this.bump();
      return;
    }
    if (key.ctrl && input === 'b') {
      this.selectedIndex = Math.max(this.selectedIndex - VISIBLE_HEIGHT, 0);
      this.ensureVisible();
      this.bump();
      return;
    }

    const resource = this.selectedRow();
    if (resource === null) {
      return;
    }
    if (key.return) {
      this.openDetail(resource, 'overview');
      return;
    }
    if (input === 'd') {
      this.requestDelete(resource);
      return;
    }
    if (input === 'e') {
      this.openDetail(resource, 'yaml');
      return;
    }
    if (input === 'y') {
      this.copyNameToClipboard(resource);
      return;
    }
    if (input === 'l' && resource.kind === 'Pod') {
      this.openDetail(resource, 'logs');
      return;
    }
    if (input === 'x' && resource.kind === 'Pod') {
      this.execPod(resource);
      return;
    }
    if (input === 'p' && resource.kind === 'Pod') {
      this.openPortPrompt(resource);
      return;
    }
  }

  private ensureVisible(): void {
    if (this.table === null) {
      return;
    }
    const offset = this.table.scrollOffset;
    if (this.selectedIndex < offset) {
      this.table = scrollUp(this.table, offset - this.selectedIndex);
    } else if (this.selectedIndex >= offset + VISIBLE_HEIGHT) {
      this.table = scrollDown(
        this.table,
        this.selectedIndex - (offset + VISIBLE_HEIGHT) + 1,
      );
    }
  }

  private handleDetailInput(input: string, key: InkKey): void {
    // DetailPane handles Tab/Shift+Tab/number tab navigation itself.
    if (
      this.detail?.yamlMode !== undefined &&
      this.detail.yamlMode !== 'read'
    ) {
      return;
    }
    if (key.escape) {
      this.closeDetail();
      return;
    }
    if (input === 'q') {
      this.quit();
    }
  }
}

function emptySummary(): ClusterSummary {
  return {
    podsRunning: 0,
    warnings: 0,
    errors: 0,
    pending: 0,
    nodesReady: 0,
    nodesTotal: 0,
    namespaceCount: 0,
  };
}
