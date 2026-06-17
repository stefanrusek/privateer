// LiveController — production composition layer (coverage-excluded glue,
// Spec 08 §5.2). Connects kubeconfig → KubeClientAdapter → StreamManager →
// StateStore → UI snapshot consumed by the Ink views. All decision logic is
// delegated to the covered pure modules (table model, fast-path, commands,
// health registry, rollups); this class only routes events and holds state.

import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import jsYaml from 'js-yaml';
import { KubeConfig } from '@kubernetes/client-node';
import type { LaunchOptions } from '../../cli/args.js';
import type { KubeError } from '../../boundaries/kube-client.js';
import type {
  ResourceEvent,
  ResourceObject,
  KubernetesObject,
} from '../../core/types.js';
import type {
  YamlReplaceResult,
  YamlReloadResult,
} from '../../ui/components/YamlTab.js';
import {
  confirmDialogKeyAction,
  applyConfirmKeyAction,
  type ConfirmSelection,
} from '../../ui/components/ConfirmDialog.js';
import type { AppState, FocusRegion } from '../../ui/types.js';
import type { TableModel } from '../../ui/resource-table-model.js';
import type { ColumnDef } from '../../resources/columns.js';
import {
  navigableTabsFor,
  prevTab,
  nextTab,
  jumpTab,
  type TabId,
} from '../../ui/detail-tabs.js';
import { nextRegion, regionOrder, clampIndex } from '../../ui/navigation.js';
import {
  type ContextMemory,
  remember as rememberContext,
  restore as restoreContext,
  parseContextMemory,
  serializeContextMemory,
} from '../../ui/context-memory.js';
import {
  type SwitchStatus,
  beginSwitch,
  onSync as switchOnSync,
  onError as switchOnError,
  retryTarget as switchRetryTarget,
} from '../../ui/context-switch.js';
import {
  buildContainerItems,
  buildLineLimitItems,
  LOGS_TOOLBAR_ACCELERATORS,
  type LogsContainerItem,
  type LogsLineLimitItem,
} from '../../ui/logs-toolbar.js';
import {
  clampOffset,
  maxOffset,
  pageBy,
  scrollBy,
  toBottom,
  toTop,
  resetOffset,
  logsLiveAfterScroll,
  type ScrollState,
  type ViewLine,
} from '../../ui/scroll-viewport.js';
import {
  projectOverviewLines,
  projectEventsLines,
  projectYamlReadLines,
  projectMetricsLines,
} from '../../ui/detail-view.js';
import { MAX_CHART_WIDTH } from '../../ui/components/MetricsTab.js';
import { projectLogsView, offsetForMatch } from '../../ui/logs-view.js';
import { helpLines, scopeForFocus } from '../../ui/keymap.js';
import {
  computeFrame,
  type Frame,
  type Segment,
} from '../../ui/layout-geometry.js';
import {
  dispatch as dispatchMouse,
  entriesEqual,
  type Action as MouseAction,
  type DragLatch,
  type Entry as HitEntry,
  type RegistrySnapshot,
} from '../../input/dispatch.js';
import { sidebarRatioFromX, verticalRatioFromY } from '../../input/ratios.js';
import {
  parseSgrMouseChunk,
  isLeakedMouseInput,
  type MouseEvent,
} from '../../input/mouse.js';
import { MouseLifecycle } from './mouse-lifecycle.js';
import type { PickerItem } from '../../ui/components/PickerOverlay.js';
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
  setHorizontalOffset,
} from '../../ui/resource-table-model.js';
import { getColumns } from '../../resources/columns.js';
import {
  naturalWidths,
  pinnedCount,
  clampHOffset,
} from '../../ui/list-horizontal.js';
import { initialAppState } from '../../cli/initial-state.js';
import { normalize } from '../../resources/normalize.js';
import { StateStore } from '../../store/state-store.js';
import { StreamManager } from '../../k8s/stream-manager.js';
import { evaluateAllRules } from '../../health/registry.js';
import { EMPTY_CAPS, type RuleCaps } from '../../health/types.js';
import { detectKafka } from '../../health/kafka-detection.js';
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
import {
  TransformersInferenceEngine,
  modelSupportsTools,
} from '../inference-engine.adapter.js';
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
import {
  CommandInput,
  loadHistory,
  appendHistory,
  resolveCommand,
  DEFAULT_COMMAND,
} from '../../exec/command-history.js';
import { PortForwardManager } from '../../portforward/manager.js';
import type { PortForwardManagerState } from '../../portforward/manager.js';
import type { MetricsTier } from '../../metrics/discovery.js';
import { SystemTunnel } from '../../metrics/system-tunnel.js';
import {
  createRangeSelector,
  selectRange,
  rangeStartMs,
  rangeDurationMs,
  type RangeLabel,
  type RangeSelectorModel,
} from '../../charts/range.js';
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
import { log } from '../logger.js';
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
  /**
   * Which button is highlighted (B3b). The controller owns this so keyboard
   * (Enter/Tab/arrows) and the measured [confirm]/[cancel] Buttons share one
   * source of truth — the dialog's own `useInput` raced the global one and
   * leaked Enter to the list. Defaults to `confirm` so Enter confirms.
   */
  selection: ConfirmSelection;
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
  /** Container dropdown items (B06); current container marked. */
  containerItems: readonly LogsContainerItem[];
  /** Index of the streamed container within `containerItems`. */
  containerIndex: number;
  /** Whether the inline container dropdown is open. */
  containerPickerOpen: boolean;
  /** Highlighted index while the container dropdown is open. */
  containerPickerIndex: number;
  /** Line-limit dropdown items (B06); current limit marked. */
  lineLimitItems: readonly LogsLineLimitItem[];
  /** Index of the current limit within `lineLimitItems`. */
  lineLimitIndex: number;
  /** Whether the inline line-limit dropdown is open. */
  lineLimitOpen: boolean;
  /** Highlighted index while the line-limit dropdown is open. */
  lineLimitPickerIndex: number;
}

/** Modal picker state (namespace dropdown, container picker). */
export interface PickerViewState {
  title: string;
  items: PickerItem[];
  selectedIndex: number;
  filter: string;
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
  range: RangeSelectorModel;
  charts: ChartSeries | null;
}

/** Prometheus queryRange results for the open detail resource. */
export interface ChartSeries {
  /** uid of the resource the series belong to. */
  uid: string;
  cpu: MetricSeries[];
  memory: MetricSeries[];
  networkIn: MetricSeries[];
  networkOut: MetricSeries[];
  restarts: MetricSeries[];
  replicas: MetricSeries[];
  lag: MetricSeries[];
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
  picker: PickerViewState | null;
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
const DEFAULT_VISIBLE_HEIGHT = 20;
/** Lines the detail wheel scrolls per wheel notch (Spec 02 §9). */
const WHEEL_LINES = 3;

/** Flatten a frame border {@link Segment} into a 1-wide hit-test rectangle. */
function segmentRect(seg: Segment): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (seg.orientation === 'vertical') {
    return {
      x: seg.position,
      y: seg.start,
      width: 1,
      height: seg.end - seg.start + 1,
    };
  }
  return {
    x: seg.start,
    y: seg.position,
    width: seg.end - seg.start + 1,
    height: 1,
  };
}

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
  /**
   * Scroll offset for the non-Logs detail tabs (Spec 03). Logs keeps its own
   * offset on `this.logs` (with the tail-pause coupling); this drives Overview,
   * YAML read mode, Events, and Metrics. Reset to the top on tab/resource change.
   */
  private detailOffset: ScrollState = { offset: 0 };
  private confirm: ConfirmState | null = null;
  private health: HealthState = {
    summary: emptySummary(),
    rules: [],
    showPassing: false,
  };
  private agentExchanges: AgentExchange[] = [];
  private switchStatus: SwitchStatus = null;
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
    /** Scroll offset into the ring buffer; honored only while paused. */
    offset: number;
    /** Inline container dropdown open state (B06; not the generic picker). */
    containerPickerOpen: boolean;
    /** Highlighted index in the container dropdown while it is open. */
    containerPickerIndex: number;
    /** Inline line-limit dropdown open state (B06). */
    lineLimitOpen: boolean;
    /** Highlighted index in the line-limit dropdown while it is open. */
    lineLimitIndex: number;
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
  // Exec command prompt (Spec 05 §4.2): editable command with ↑/↓ history.
  private execPrompt: {
    resource: ResourceObject;
    container: string;
    input: CommandInput;
  } | null = null;
  private picker:
    | (PickerViewState & {
        onPick: (value: string) => void;
      })
    | null = null;

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
  private kafkaDetected: ReturnType<typeof detectKafka> = {
    deploymentType: 'none',
    mode: 'unknown',
  };
  private kafkaLagByTopic = new Map<string, number>();
  private promTunnel: SystemTunnel | null = null;
  private metricsRange = createRangeSelector();
  private charts: ChartSeries | null = null;
  private chartsFetchSeq = 0;

  private readonly fileSink = new FsFileSink();
  private started = false;
  private layoutSaveDebounce: (() => void) | null = null;
  // Active detail tab remembered per resource kind (Spec 01 §4).
  private tabByKind = new Map<string, TabId>();
  // Per-context {namespace, activeKind} memory (chunk 08 §4), persisted in
  // layout.json under `contexts`. Pure logic lives in src/ui/context-memory.ts.
  private contextMemory: ContextMemory = {};
  // A remembered namespace whose validity could not yet be checked (namespaces
  // had not loaded when the switch landed); applied once they do.
  private pendingNamespaceRestore: { ctx: string; namespace: string } | null =
    null;

  // Agent (Spec 07): engine loads lazily in the background after launch.
  private enginePromise: Promise<InferenceEngine> | null = null;
  private agentTimeoutMs = 15_000;
  private agentModelId: string | undefined;

  // Terminal dimensions (updated by LiveApp on resize)
  private terminalColumns = 80;
  private terminalRows = 24;

  private pendingG: number | null = null;
  // Help overlay scroll offset (B09). The overlay windows the flattened keymap;
  // ↑/↓ walk it. Reset to the top each time the overlay opens.
  private helpScroll = 0;
  private listeners = new Set<() => void>();
  private snapshot: LiveSnapshot | null = null;
  private cancels: (() => void)[] = [];
  private healthDebounce: (() => void) | null = null;
  private readonly noAgent: boolean;
  private readonly onExit: () => void;
  // Owns the mouse-mode lifecycle; tearDown() is the single idempotent function
  // every exit/suspend path calls so escape sequences never leak (Spec 01 §3.5).
  private readonly mouse = new MouseLifecycle();

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
    this.loadLayout();
  }

  // -------------------------------------------------------------------------
  // Layout persistence (Spec 01 §4 — ~/.config/p9r/layout.json)
  // -------------------------------------------------------------------------

  private layoutPath(): string {
    return join(homedir(), '.config', 'p9r', 'layout.json');
  }

  private loadLayout(): void {
    try {
      if (!existsSync(this.layoutPath())) {
        return;
      }
      const raw = JSON.parse(readFileSync(this.layoutPath(), 'utf8')) as {
        sidebarRatio?: number;
        verticalRatio?: number;
        collapsedCategories?: string[];
        tabByKind?: Record<string, TabId>;
        contexts?: unknown;
      };
      this.app = {
        ...this.app,
        ...(typeof raw.sidebarRatio === 'number'
          ? { sidebarRatio: Math.min(0.4, Math.max(0.1, raw.sidebarRatio)) }
          : {}),
        ...(typeof raw.verticalRatio === 'number'
          ? { verticalRatio: Math.min(0.8, Math.max(0.2, raw.verticalRatio)) }
          : {}),
        ...(Array.isArray(raw.collapsedCategories)
          ? { collapsedCategories: new Set(raw.collapsedCategories) }
          : {}),
      };
      for (const [kind, tab] of Object.entries(raw.tabByKind ?? {})) {
        this.tabByKind.set(kind, tab);
      }
      // Per-context memory — tolerant of the old schema (no `contexts` key).
      this.contextMemory = parseContextMemory(raw.contexts);
    } catch {
      // Corrupt layout file — start fresh.
    }
  }

  private saveLayout(): void {
    this.layoutSaveDebounce ??= this.clock.setTimeout(() => {
      this.layoutSaveDebounce = null;
      try {
        mkdirSync(join(homedir(), '.config', 'p9r'), { recursive: true });
        writeFileSync(
          this.layoutPath(),
          JSON.stringify(
            {
              sidebarRatio: this.app.sidebarRatio,
              verticalRatio: this.app.verticalRatio,
              collapsedCategories: [...this.app.collapsedCategories],
              tabByKind: Object.fromEntries(this.tabByKind),
              contexts: serializeContextMemory(this.contextMemory),
            },
            null,
            2,
          ),
        );
      } catch {
        // Persistence is best-effort.
      }
    }, 1000);
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

    // Config-driven agent settings with hot-reload (Spec 01 §4).
    const configStore = new FsConfigStore(
      join(homedir(), '.config', 'p9r', 'config.yaml'),
    );
    const applyConfig = (raw: Record<string, unknown>): void => {
      const config = parseConfig(raw);
      this.agentTimeoutMs = config.agentTimeoutSeconds * 1000;
      // Spec 07 §11 names the model "gemma-4-E2B-it-onnx"; that sentinel
      // (and E4B) keeps the adapter default. Anything else (a real HF
      // model id) is passed through.
      const model = config.agentModel.startsWith('gemma-4-')
        ? undefined
        : config.agentModel;
      if (model !== this.agentModelId) {
        this.agentModelId = model;
        // Next query loads the newly configured model.
        this.enginePromise = null;
        this.toolsEnabled = false;
      }
    };
    void configStore.load().then((result) => {
      if (result.ok) {
        applyConfig(result.value);
      }
    });
    this.cancels.push(
      configStore.watch((config) => {
        applyConfig(config);
        this.bump();
      }),
    );

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
    // Tear down the metrics port-forward child, or its lingering kubectl
    // keeps the Node event loop alive and quit hangs (Spec 05 §5.6).
    this.promTunnel?.close();
    this.promTunnel = null;
    // Terminate any user port-forwards for the same reason.
    for (const fwd of this.pf.getState().forwards) {
      this.pf.stop(fwd.id);
    }
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
      picker: this.pickerView(),
      metrics: {
        tier: this.metricsTier,
        capabilities: this.metricsCaps,
        range: this.metricsRange,
        charts: this.charts,
      },
      nowMs: this.clock.now(),
    };
    return this.snapshot;
  };

  setTerminalSize = (columns: number, rows: number): void => {
    if (columns !== this.terminalColumns || rows !== this.terminalRows) {
      this.terminalColumns = columns;
      this.terminalRows = rows;
      this.bump();
    }
  };

  /**
   * The single layout-geometry source (Spec 02 §"Single source of truth").
   * Every size/position below derives from this frame; the controller does no
   * geometry arithmetic of its own.
   */
  frame(): Frame {
    return computeFrame({
      columns: this.terminalColumns,
      rows: this.terminalRows,
      sidebarRatio: this.app.sidebarRatio,
      verticalRatio: this.app.verticalRatio,
      showDetail: this.app.showDetail,
    });
  }

  /** Rows available to the resource table (= the list region inner height). */
  visibleHeight(): number {
    const h = this.frame().list.height;
    return h > 0 ? h : DEFAULT_VISIBLE_HEIGHT;
  }

  /** Columns available to the resource table (= the list region inner width). */
  tableWidth(): number {
    return this.frame().list.width;
  }

  /**
   * Rows of scrollable content the detail pane shows (Spec 03). The tab bar
   * occupies the detail region's top row, so the generic viewport is one row
   * shorter than the inner height.
   */
  private detailViewportHeight(): number {
    const detail = this.frame().detail;
    const inner = detail !== null ? detail.height : 0;
    return Math.max(1, inner - 1);
  }

  /** Inner width of the detail pane — content clips here (Spec 02/03). */
  private detailWidth(): number {
    const detail = this.frame().detail;
    return detail !== null ? detail.width : this.frame().list.width;
  }

  /**
   * Project the active **non-Logs** detail tab's content to `ViewLine[]` (Spec
   * 03), using the same `detail-view` helpers the components render through, so
   * the controller's line count matches what is on screen. Returns `null` for
   * Logs (own offset) and Agent (interactive, not viewport-scrolled).
   */
  private detailLines(): ViewLine[] | null {
    const d = this.detail;
    if (d === null) {
      return null;
    }
    const width = this.detailWidth();
    switch (d.tab) {
      case 'overview':
        return projectOverviewLines(d.resource, this.clock.now(), width);
      case 'yaml':
        return projectYamlReadLines(
          this.yamlForDetail(),
          d.resource.kind,
          false,
          width,
        );
      case 'events':
        return projectEventsLines(
          d.events,
          d.warningCount,
          d.showAllEvents,
          this.clock.now(),
          width,
        );
      case 'metrics':
        return projectMetricsLines(this.metricsProjectionInput(width), width);
      case 'logs':
      case 'agent':
        return null;
    }
  }

  /** Assemble the metrics projection inputs (charts when present, else session). */
  private metricsProjectionInput(
    width: number,
  ): Parameters<typeof projectMetricsLines>[0] {
    const d = this.detail;
    const resource =
      d !== null
        ? d.resource
        : ({ kind: '', name: '', namespace: null } as ResourceObject);
    const charts =
      this.metricsTier === 'prometheus' && this.charts?.uid === resource.uid
        ? this.charts
        : null;
    const session = charts === null ? this.sessionSeries(resource) : null;
    const chartWidth =
      width > 0 ? Math.min(width, MAX_CHART_WIDTH) : MAX_CHART_WIDTH;
    return {
      resourceKind: resource.kind,
      resourceName: resource.name,
      tier: this.metricsTier,
      capabilities: this.metricsCaps,
      chartWidth,
      cpuSeries: charts?.cpu ?? session?.cpu ?? [],
      memorySeries: charts?.memory ?? session?.memory ?? [],
      networkInSeries: charts?.networkIn ?? [],
      networkOutSeries: charts?.networkOut ?? [],
      restartSeries: charts?.restarts ?? [],
      replicaSeries: charts?.replicas ?? [],
      lagSeries: charts?.lag ?? [],
      rangeOptions: this.metricsRange.options,
      rangeSelected: this.metricsRange.selected,
    };
  }

  /** Total projected line count for the active non-Logs tab (0 when N/A). */
  private detailTotalLines(): number {
    return this.detailLines()?.length ?? 0;
  }

  /** The detail scroll offset exposed to LiveApp (clamped). */
  detailScrollOffset(): number {
    return clampOffset(
      this.detailOffset.offset,
      this.detailTotalLines(),
      this.detailViewportHeight(),
    );
  }

  /** The detail viewport height exposed to LiveApp (non-Logs tabs). */
  detailScrollViewportHeight(): number {
    return this.detailViewportHeight();
  }

  /** The detail pane inner width exposed to LiveApp. */
  detailScrollWidth(): number {
    return this.detailWidth();
  }

  /** Reset the non-Logs detail offset to the top (tab/resource change). */
  private resetDetailOffset(): void {
    this.detailOffset = resetOffset(
      false,
      this.detailTotalLines(),
      this.detailViewportHeight(),
    );
  }

  /**
   * Drive the non-Logs detail viewport from a motion key (`↑/↓`, PageUp/Down,
   * Home/End, `g`/`G`). Returns true when the key moved the viewport.
   */
  private scrollDetail(input: string, key: InkKey): boolean {
    const total = this.detailTotalLines();
    const vh = this.detailViewportHeight();
    const start = this.detailOffset;
    if (key.upArrow) {
      this.detailOffset = scrollBy(start, -1, total, vh);
    } else if (key.downArrow) {
      this.detailOffset = scrollBy(start, 1, total, vh);
    } else if (key.pageUp) {
      this.detailOffset = pageBy(start, 'up', total, vh);
    } else if (key.pageDown) {
      this.detailOffset = pageBy(start, 'down', total, vh);
    } else if (input === 'g') {
      this.detailOffset = toTop();
    } else if (input === 'G') {
      this.detailOffset = toBottom(total, vh);
    } else {
      return false;
    }
    this.bump();
    return true;
  }

  /**
   * Rows available to the Logs body specifically. Beyond the tab bar, LogsTab
   * draws four chrome rows above the lines (title, toolbar, state hints,
   * divider); the viewport is sized so the windowed lines never overflow.
   */
  private logsViewportHeight(): number {
    return Math.max(
      1,
      this.detailViewportHeight() - LiveController.LOGS_CHROME_ROWS,
    );
  }

  terminalSize(): { columns: number; rows: number } {
    return { columns: this.terminalColumns, rows: this.terminalRows };
  }

  private appWithIndicators(): AppState {
    const active = this.pf
      .getState()
      .forwards.filter((f) => f.status !== 'failed').length;
    const hints = [
      `⌖ ${this.app.focus}`,
      ...(active > 0 ? [`⇄ ${String(active)}`] : []),
      ...this.app.hints,
    ];
    return { ...this.app, hints };
  }

  private commandBarText(): string {
    if (this.execPrompt !== null) {
      const shown = this.execPrompt.input.value;
      return `exec ${this.execPrompt.resource.name} ▸ ${shown.length > 0 ? shown : DEFAULT_COMMAND} (↑ history)`;
    }
    if (this.portPrompt !== null) {
      return `⇄ ${this.portPrompt.podName} ports remote:local = ${this.portPrompt.text}`;
    }
    return this.commandOpen ? this.inputText : '';
  }

  /** LogsTab chrome rows above the lines (title, toolbar, hints, divider). */
  private static readonly LOGS_CHROME_ROWS = 4;

  private buildLogsView(): LogsViewState | null {
    if (this.logs === null) {
      return null;
    }
    const l = this.logs;
    const projection = projectLogsView({
      raw: l.ring.toArray(),
      offset: l.offset,
      viewportHeight: this.logsViewportHeight(),
      timestamps: l.timestamps,
      live: l.live,
    });
    // Search runs over the full projected list; the cursor stays in range.
    const base =
      l.searchQuery === ''
        ? emptySearch()
        : runSearch(projection.display, l.searchQuery);
    const ranged: SearchState =
      base.matches.length === 0
        ? base
        : {
            ...base,
            current: Math.min(
              Math.max(l.searchCurrent, 0),
              base.matches.length - 1,
            ),
          };
    // Shift match indices to window coordinates so LogsTab highlights the right
    // visible row; the count (`matches.length`, `current`) is unchanged.
    const search: SearchState = {
      ...ranged,
      matches: ranged.matches.map((m) => m - projection.offset),
    };
    const containerItems = buildContainerItems(l.containers, l.container);
    const lineLimitItems = buildLineLimitItems(l.limit);
    const containerIndex = l.containers.findIndex(
      (c) => c.name === l.container,
    );
    const lineLimitIndex = LINE_OPTIONS.findIndex((o) => o.id === l.limit);
    return {
      podName: l.podName,
      container: l.container,
      lines: projection.visible,
      live: l.live,
      timestamps: l.timestamps,
      wrap: l.wrap,
      lineLimitLabel: findLineOption(l.limit)?.buttonLabel ?? l.limit,
      previous: l.previous,
      search,
      searchFocused: l.searchFocused,
      newLinesAvailable: l.newLines > 0,
      confirmation: l.confirmation,
      containerItems,
      containerIndex: containerIndex < 0 ? 0 : containerIndex,
      containerPickerOpen: l.containerPickerOpen,
      containerPickerIndex: l.containerPickerIndex,
      lineLimitItems,
      lineLimitIndex: lineLimitIndex < 0 ? 0 : lineLimitIndex,
      lineLimitOpen: l.lineLimitOpen,
      lineLimitPickerIndex: l.lineLimitIndex,
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
    log.debug('streams starting');
    void this.startStreamsWithCrds();
  }

  /**
   * Discover CRDs first so CRD kinds (Kafka, KafkaTopic, …) resolve to the
   * right API paths and the Kafka core watches open when Strimzi is present
   * (Spec 01 §3.1, Spec 03 §7).
   */
  private async startStreamsWithCrds(): Promise<void> {
    let kafkaKinds = new Set<string>();
    const crds = await this.client.discoverCrds();
    if (crds.ok) {
      this.client.registerCrds(crds.value);
      // Seed the store with CRD objects so Strimzi detection and the CRD
      // table work without a separate watch.
      const now = this.clock.now();
      for (const crd of crds.value) {
        this.store.applyEvent(this.app.context, {
          type: 'ADDED',
          apiVersion: 'apiextensions.k8s.io/v1',
          kind: 'CustomResourceDefinition',
          namespace: null,
          name: `${crd.plural}.${crd.group}`,
          receivedAt: now,
          object: {
            apiVersion: 'apiextensions.k8s.io/v1',
            kind: 'CustomResourceDefinition',
            metadata: { name: `${crd.plural}.${crd.group}` },
            spec: {
              group: crd.group,
              names: { kind: crd.kind, plural: crd.plural },
            },
          },
        });
      }
      if (crds.value.some((crd) => crd.group === 'kafka.strimzi.io')) {
        kafkaKinds = new Set(['Kafka', 'KafkaTopic']);
      }
    }
    this.openStreams(kafkaKinds);
  }

  private openStreams(kafkaKinds: ReadonlySet<string>): void {
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
    this.streams.start(kafkaKinds);
  }

  private onResourceEvent(event: ResourceEvent): void {
    log.debug(
      { type: event.type, kind: event.kind, name: event.name },
      'stream event',
    );
    this.store.applyEvent(this.app.context, event);

    const kind = event.object.kind ?? event.kind;
    this.clearKindMarks(kindToLabel(kind));
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
    // A store change is the first/ongoing sync from the new context's streams —
    // it clears any `connecting` switch status (chunk 08 §3).
    this.settleSwitchOnSync();
    // Coalesced refresh: badges for core kinds, namespaces, health summary.
    this.refreshNamespaces();
    this.refreshCoreBadges();
    this.healthDebounce ??= this.clock.setTimeout(() => {
      this.healthDebounce = null;
      this.evaluateHealth();
    }, 2000);
    this.bump();
  }

  /** Clear `connecting` once the new context's first sync arrives. */
  private settleSwitchOnSync(): void {
    const next = switchOnSync(this.switchStatus, this.app.context);
    if (next !== this.switchStatus) {
      this.switchStatus = next;
      this.app = { ...this.app, switchStatus: next };
    }
  }

  private refreshNamespaces(): void {
    const namespaces = this.store
      .list(this.app.context, 'Namespace')
      .map((r) => r.name)
      .sort();
    if (namespaces.join(',') !== this.app.allNamespaces.join(',')) {
      this.app = { ...this.app, allNamespaces: namespaces };
    }
    this.applyPendingNamespaceRestore(namespaces);
  }

  /**
   * Apply a context's remembered namespace once its namespaces have loaded and
   * the value still exists (chunk 08 §4); otherwise leave all-namespaces.
   */
  private applyPendingNamespaceRestore(namespaces: readonly string[]): void {
    const pending = this.pendingNamespaceRestore;
    if (pending?.ctx !== this.app.context) {
      return;
    }
    if (namespaces.includes(pending.namespace)) {
      this.pendingNamespaceRestore = null;
      this.setNamespace(pending.namespace);
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
      if (!result.ok) {
        log.debug(
          { kind, errorKind: result.error.kind, message: result.error.message },
          'badge list failed',
        );
      }
      if (result.ok) {
        const count =
          result.value.items.length + (result.value.remainingItemCount ?? 0);
        const forbidden = new Set(this.app.forbiddenKinds);
        forbidden.delete(label);
        this.app = { ...this.app, forbiddenKinds: forbidden };
        this.setBadge(label, count, true);
      } else if (result.error.kind === 'forbidden') {
        const forbidden = new Set(this.app.forbiddenKinds);
        forbidden.add(label);
        this.app = { ...this.app, forbiddenKinds: forbidden };
        this.bump();
      }
    }
  }

  /** A kind delivered data — clear any stale forbidden/dimmed marks. */
  private clearKindMarks(label: string): void {
    if (
      !this.app.forbiddenKinds.has(label) &&
      !this.app.dimmedKinds.has(label)
    ) {
      return;
    }
    const forbidden = new Set(this.app.forbiddenKinds);
    forbidden.delete(label);
    const dimmed = new Set(this.app.dimmedKinds);
    dimmed.delete(label);
    this.app = { ...this.app, forbiddenKinds: forbidden, dimmedKinds: dimmed };
  }

  private onStreamError(kind: string, error: KubeError): void {
    log.warn(
      { kind, errorKind: error.kind, message: error.message },
      'stream error',
    );
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
      // A non-RBAC stream error during a switch is a connection failure: surface
      // the "Could not connect" banner with [Retry] / [Switch context]
      // (chunk 08 §3). Forbidden is per-kind RBAC, not a connect failure.
      this.failSwitchOnError(error.message);
    }
    this.bump();
  }

  /** Transition a `connecting` switch to `error` on a connection failure. */
  private failSwitchOnError(reason: string): void {
    const next = switchOnError(this.switchStatus, this.app.context, reason);
    if (next !== this.switchStatus) {
      this.switchStatus = next;
      this.app = { ...this.app, switchStatus: next };
    }
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

    // 1. Explicit Prometheus URL (config override or env) — reachable as-is.
    const configResult = await configStore.load();
    const configUrl =
      configResult.ok &&
      typeof (configResult.value.prometheus as { url?: unknown } | undefined)
        ?.url === 'string'
        ? (configResult.value.prometheus as { url: string }).url
        : undefined;
    const explicitUrl = configUrl ?? process.env.PROMETHEUS_URL;
    if (explicitUrl !== undefined && explicitUrl.length > 0) {
      const source = new PrometheusHttpAdapter(explicitUrl);
      const probe = await source.probeSeries('up');
      if (probe.ok) {
        await this.usePrometheus(source);
        return;
      }
    }

    // 2. In-cluster Prometheus service — p9r runs on the host, so in-cluster
    //    URLs need a system port-forward tunnel (Spec 06 §2.2 / Spec 01 OQ-2).
    const promService = await this.findPrometheusService();
    if (promService !== null) {
      const localPort = 39_090;
      this.promTunnel = new SystemTunnel(new SubprocessRunner(), this.clock, {
        resource: `service/${promService.name}`,
        namespace: promService.namespace,
        remotePort: promService.port,
        localPort,
      });
      this.promTunnel.open();
      const active = await this.awaitTunnel(this.promTunnel, 15_000);
      if (active) {
        const source = new PrometheusHttpAdapter(
          `http://127.0.0.1:${String(localPort)}`,
        );
        const probe = await source.probeSeries('up');
        if (probe.ok) {
          await this.usePrometheus(source);
          // metrics-server still feeds the session buffer for sparkline
          // columns and the dashboard overview.
          this.startMetricsServerPolling(msAdapter);
          return;
        }
      }
      this.promTunnel.close();
      this.promTunnel = null;
    }

    // 3. metrics-server fallback
    const msProbe = await msAdapter.probeSeries('up');
    if (msProbe.ok) {
      this.metricsTier = 'metrics-server';
      // Under metrics-server, CPU/memory charts render from the session
      // buffer; the cadvisor capability gates exactly those charts.
      this.metricsCaps = {
        cadvisor: true,
        kubeStateMetrics: false,
        kafkaExporter: false,
        strimziJmx: false,
      };
      this.startMetricsServerPolling(msAdapter);
    } else {
      this.metricsTier = 'none';
    }
    this.refreshMetricsColumns();
    this.bump();
  }

  private async usePrometheus(source: PrometheusHttpAdapter): Promise<void> {
    this.prometheus = source;
    this.metricsTier = 'prometheus';
    this.metricsCaps = await detectExporterCapabilities(source);
    this.refreshMetricsColumns();
    this.bump();
  }

  private startMetricsServerPolling(msAdapter: MetricsServerAdapter): void {
    this.metricsServer = msAdapter;
    void this.pollMetricsServer();
    this.cancels.push(
      this.clock.setInterval(() => {
        void this.pollMetricsServer();
      }, 30_000),
    );
  }

  private refreshMetricsColumns(): void {
    if (this.app.activeKind !== 'Overview') {
      this.columns = this.columnsForKind(
        labelToKind(this.app.activeKind) ?? '',
      );
    }
  }

  /** Find a Prometheus service to tunnel to (standard names, then labels). */
  private async findPrometheusService(): Promise<{
    name: string;
    namespace: string;
    port: number;
  } | null> {
    const services = await this.client.list('Service', {});
    if (!services.ok) {
      return null;
    }
    const standardNames = new Set([
      'prometheus-operated',
      'prometheus',
      'prometheus-server',
    ]);
    interface SvcRaw {
      metadata?: {
        name?: string;
        namespace?: string;
        labels?: Record<string, string>;
      };
      spec?: { ports?: { port?: number }[] };
    }
    const items = services.value.items as SvcRaw[];
    const byName = items.find((svc) =>
      standardNames.has(svc.metadata?.name ?? ''),
    );
    const byLabel = items.find(
      (svc) =>
        svc.metadata?.labels?.app === 'prometheus' ||
        svc.metadata?.labels?.['app.kubernetes.io/name'] === 'prometheus',
    );
    const found = byName ?? byLabel;
    if (found?.metadata?.name === undefined) {
      return null;
    }
    return {
      name: found.metadata.name,
      namespace: found.metadata.namespace ?? 'default',
      port: found.spec?.ports?.[0]?.port ?? 9090,
    };
  }

  private awaitTunnel(
    tunnel: SystemTunnel,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const cancel = this.clock.setTimeout(() => {
        off();
        resolve(tunnel.getState().status === 'active');
      }, timeoutMs);
      const off = tunnel.onChange(() => {
        const status = tunnel.getState().status;
        if (status === 'active') {
          cancel();
          off();
          // Give kubectl a beat to actually accept connections.
          this.cancels.push(
            this.clock.setTimeout(() => {
              resolve(true);
            }, 500),
          );
        } else if (status === 'failed' || status === 'closed') {
          cancel();
          off();
          resolve(false);
        }
      });
    });
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

  // -------------------------------------------------------------------------
  // Prometheus chart queries (Spec 06 §4)
  // -------------------------------------------------------------------------

  setMetricsRange = (label: RangeLabel): void => {
    this.metricsRange = selectRange(this.metricsRange, label);
    void this.fetchCharts();
    this.bump();
  };

  /** PromQL per chart for the selected resource (Spec 06 §4.3). */
  private chartQueries(
    resource: ResourceObject,
  ): Partial<Record<keyof Omit<ChartSeries, 'uid'>, string>> {
    const ns = resource.namespace ?? '';
    const name = resource.name;
    const podsOf = `{namespace="${ns}",pod=~"${name}-.*",container!="",image!=""}`;
    switch (resource.kind) {
      case 'Pod': {
        const sel = `{namespace="${ns}",pod="${name}",container!="",image!=""}`;
        const podSel = `{namespace="${ns}",pod="${name}"}`;
        return {
          cpu: `sum(rate(container_cpu_usage_seconds_total${sel}[2m])) * 1000`,
          memory: `sum(container_memory_working_set_bytes${sel})`,
          networkIn: `sum(rate(container_network_receive_bytes_total${podSel}[2m]))`,
          networkOut: `sum(rate(container_network_transmit_bytes_total${podSel}[2m]))`,
          ...(this.metricsCaps.kubeStateMetrics
            ? {
                restarts: `sum(kube_pod_container_status_restarts_total${podSel})`,
              }
            : {}),
        };
      }
      case 'Node': {
        const sel = `{id="/",node="${name}"}`;
        return {
          cpu: `100 * sum(rate(container_cpu_usage_seconds_total${sel}[2m])) / sum(machine_cpu_cores{node="${name}"})`,
          memory: `100 * sum(container_memory_working_set_bytes${sel}) / sum(machine_memory_bytes{node="${name}"})`,
        };
      }
      case 'Deployment':
      case 'StatefulSet': {
        const ksmKind =
          resource.kind === 'Deployment' ? 'deployment' : 'statefulset';
        return {
          cpu: `sum(rate(container_cpu_usage_seconds_total${podsOf}[2m])) * 1000`,
          memory: `sum(container_memory_working_set_bytes${podsOf})`,
          ...(this.metricsCaps.kubeStateMetrics
            ? {
                replicas: `kube_${ksmKind}_status_replicas{namespace="${ns}",${ksmKind}="${name}"}`,
              }
            : {}),
        };
      }
      case 'KafkaTopic':
        return this.metricsCaps.kafkaExporter
          ? {
              lag: `sum by (consumergroup) (kafka_consumergroup_lag{topic="${name}"})`,
            }
          : {};
      default:
        return {};
    }
  }

  private async fetchCharts(): Promise<void> {
    const prom = this.prometheus;
    const resource = this.detail?.resource;
    if (
      prom === null ||
      resource === undefined ||
      this.detail?.tab !== 'metrics'
    ) {
      return;
    }
    const seq = ++this.chartsFetchSeq;
    const now = this.clock.now();
    const durationMs = rangeDurationMs(this.metricsRange.selected);
    const range = {
      startMs: rangeStartMs(this.metricsRange, now),
      endMs: now,
      stepSeconds: Math.max(15, Math.round(durationMs / 1000 / 120)),
    };
    const queries = this.chartQueries(resource);
    const result: ChartSeries = {
      uid: resource.uid,
      cpu: [],
      memory: [],
      networkIn: [],
      networkOut: [],
      restarts: [],
      replicas: [],
      lag: [],
    };
    await Promise.all(
      (
        Object.entries(queries) as [keyof Omit<ChartSeries, 'uid'>, string][]
      ).map(async ([key, promql]) => {
        const r = await prom.queryRange(promql, range);
        if (r.ok) {
          result[key] = r.value;
        }
      }),
    );
    this.applyCharts(seq, resource.uid, result);
  }

  private applyCharts(seq: number, uid: string, result: ChartSeries): void {
    if (seq === this.chartsFetchSeq && this.detail?.uid === uid) {
      this.charts = result;
      this.bump();
    }
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
    this.kafkaDetected = detectKafka(this.store, ctx);
    const caps: RuleCaps = {
      ...EMPTY_CAPS,
      strimziPresent: this.kafkaDetected.deploymentType === 'strimzi',
      kafkaExporter: this.metricsCaps.kafkaExporter,
      strimziJmx: this.metricsCaps.strimziJmx,
    };
    const rules = evaluateAllRules(this.store, ctx, caps);
    this.health = { ...this.health, summary, rules };
    if (this.metricsCaps.kafkaExporter) {
      void this.refreshKafkaLag();
    }
    this.bump();
  }

  /** Max consumer lag per topic from Prometheus (Spec 06 §5/§7). */
  private async refreshKafkaLag(): Promise<void> {
    const prom = this.prometheus;
    if (prom === null) {
      return;
    }
    const result = await prom.query('max by (topic) (kafka_consumergroup_lag)');
    if (result.ok) {
      this.kafkaLagByTopic = new Map(
        result.value.map((sample) => [sample.labels.topic ?? '', sample.value]),
      );
      this.bump();
    }
  }

  /** Kafka section data for the health dashboard (Spec 06 §5). */
  kafkaSection(): {
    detected: boolean;
    deploymentType: 'strimzi' | 'bare' | 'none';
    exporterAvailable: boolean;
    topics: { name: string; maxLag: number; trend: 'stable' }[];
  } {
    const detected = this.kafkaDetected.deploymentType !== 'none';
    return {
      detected,
      deploymentType: this.kafkaDetected.deploymentType,
      exporterAvailable: this.metricsCaps.kafkaExporter,
      topics: detected
        ? this.store.list(this.app.context, 'KafkaTopic').map((topic) => ({
            name: topic.name,
            maxLag: this.kafkaLagByTopic.get(topic.name) ?? 0,
            trend: 'stable' as const,
          }))
        : [],
    };
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
    this.saveLayout();
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
      this.tabByKind.set(this.detail.resource.kind, tab);
      this.saveLayout();
      if (tab === 'logs' && this.detail.resource.kind === 'Pod') {
        this.initLogs(this.detail.resource);
      }
      if (tab === 'metrics') {
        void this.fetchCharts();
      }
      // Spec 03: the new tab starts at its top (Logs starts at its bottom,
      // owned by `this.logs`).
      this.resetDetailOffset();
      this.bump();
    }
  };

  closeDetail = (): void => {
    this.detail = null;
    this.agentPaneOpen = false;
    this.charts = null;
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

  // -------------------------------------------------------------------------
  // YAML editor cluster boundary (B07). The YamlTab component owns the editor
  // state and the pure apply/conflict reducer; these callbacks perform the only
  // side effects the reducer asks for. The component never touches kubeClient.
  // -------------------------------------------------------------------------

  /** The resource currently shown in the YAML tab, serialized to YAML. */
  yamlForDetail(): string {
    const raw = this.detail?.resource.raw ?? {};
    return jsYaml.dump(raw, { lineWidth: -1, indent: 2 });
  }

  /** A header label for the diff (`Kind/namespace/name`). */
  yamlTitle(): string {
    const r = this.detail?.resource;
    if (r === undefined) {
      return '';
    }
    return `${r.kind}/${r.namespace ?? ''}/${r.name}`;
  }

  /** Apply the edited YAML via kubeClient.replace; map the result for the reducer. */
  yamlReplace = async (newYaml: string): Promise<YamlReplaceResult> => {
    let parsed: unknown;
    try {
      parsed = jsYaml.load(newYaml);
    } catch (err) {
      return {
        ok: false,
        conflict: false,
        message: err instanceof Error ? err.message : 'invalid YAML',
      };
    }
    const result = await this.client.replace(parsed as KubernetesObject);
    if (result.ok) {
      return { ok: true };
    }
    if (result.error.kind === 'conflict') {
      return { ok: false, conflict: true };
    }
    return { ok: false, conflict: false, message: result.error.message };
  };

  /** Re-fetch the YAML-tab resource fresh (reload-&-re-edit after a 409). */
  yamlReload = async (): Promise<YamlReloadResult> => {
    const r = this.detail?.resource;
    if (r === undefined) {
      return { ok: false, message: 'no resource' };
    }
    const result = await this.client.get(r.kind, r.name, r.namespace);
    if (!result.ok) {
      return { ok: false, message: result.error.message };
    }
    return {
      ok: true,
      yaml: jsYaml.dump(result.value, { lineWidth: -1, indent: 2 }),
    };
  };

  /**
   * Pop out to `$EDITOR` (fallback `vi`): write the buffer to a temp file,
   * suspend the TUI (which tears down mouse reporting — the chunk-04 invariant,
   * re-asserted here), spawn the editor, read the file back, and best-effort
   * unlink it. Errors never reach stdout; on failure the input is returned
   * unchanged. Resolves to the (possibly externally edited) YAML.
   */
  yamlOpenInEditor = (yaml: string): Promise<string> => {
    const r = this.detail?.resource;
    const tag = r === undefined ? 'resource' : `${r.kind}-${r.name}`;
    const safeTag = tag.replace(/[^A-Za-z0-9_-]/g, '_');
    const path = join(
      tmpdir(),
      `p9r-edit-${safeTag}-${randomBytes(4).toString('hex')}.yaml`,
    );
    return new Promise<string>((resolve) => {
      let result = yaml;
      try {
        writeFileSync(path, yaml, 'utf8');
      } catch {
        resolve(yaml);
        return;
      }
      this.suspendRunner(
        () =>
          new Promise<void>((done) => {
            const editor = process.env.EDITOR ?? 'vi';
            const child = spawn(editor, [path], { stdio: 'inherit' });
            const finish = (): void => {
              try {
                result = readFileSync(path, 'utf8');
              } catch {
                // Read failed — keep the original buffer.
              }
              try {
                unlinkSync(path);
              } catch {
                // Best-effort cleanup.
              }
              resolve(result);
              done();
            };
            child.on('exit', finish);
            child.on('error', finish);
          }),
      );
    });
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

  /** Move the highlight between [confirm] and [cancel] (B3b). */
  confirmSelect = (selection: ConfirmSelection): void => {
    if (this.confirm === null || this.confirm.selection === selection) {
      return;
    }
    this.confirm = { ...this.confirm, selection };
    this.bump();
  };

  /**
   * Keyboard for the active confirm dialog (B3b). Esc cancels; Enter activates
   * the highlighted button (defaulting to confirm); ←/→/Tab toggle the
   * highlight. The pure reducer in ConfirmDialog decides the action.
   */
  private handleConfirmInput(input: string, key: InkKey): void {
    if (this.confirm === null) {
      return;
    }
    const action = confirmDialogKeyAction(input, key);
    switch (action.kind) {
      case 'cancel':
        this.confirmCancel();
        return;
      case 'confirm':
        if (this.confirm.selection === 'confirm') {
          this.confirmAccept();
        } else {
          this.confirmCancel();
        }
        return;
      case 'toggle':
        this.confirmSelect(
          applyConfirmKeyAction(action, this.confirm.selection),
        );
        return;
      case 'none':
        return;
    }
  }

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

  /**
   * Open the context switcher (B04b: the header context `<Button>` and chunk
   * 08's `c` key both call this). Chunk 08 adds the reconnect/error state; for
   * now it just raises the existing switcher overlay.
   */
  openContextSwitcher = (): void => {
    this.app = { ...this.app, contextSwitcherOpen: true };
    this.bump();
  };

  /**
   * Re-run the connection for the context that failed to switch (chunk 08 §3,
   * the error banner's [Retry]). Restarts the streams and returns the header to
   * the `connecting` state. No-op unless we are in the error state.
   */
  retrySwitch = (): void => {
    const target = switchRetryTarget(this.switchStatus);
    if (target === null) {
      return;
    }
    this.streams?.stop();
    this.switchStatus = beginSwitch(target);
    this.app = {
      ...this.app,
      forbiddenKinds: new Set(),
      dimmedKinds: new Set(),
      switchStatus: this.switchStatus,
    };
    this.startStreams();
    void this.badgeSweep();
    this.bump();
  };

  /**
   * Dismiss the error banner and reopen the switcher so another context can be
   * picked (chunk 08 §3, the banner's [Switch context]). The failed
   * `switchStatus` is cleared so the banner does not linger behind the modal.
   */
  switchContextFromError = (): void => {
    this.switchStatus = null;
    this.app = {
      ...this.app,
      switchStatus: null,
      contextSwitcherOpen: true,
    };
    this.bump();
  };

  closeHelp = (): void => {
    this.app = { ...this.app, helpOpen: false };
    this.bump();
  };

  /** The help overlay's current scroll offset (consumed by AppRoot). */
  getHelpScroll(): number {
    return this.helpScroll;
  }

  /** Body rows the help overlay shows before scrolling (matches AppRoot math). */
  private helpViewportHeight(): number {
    return Math.max(1, this.terminalRows - 7);
  }

  /**
   * Scroll the help overlay by `delta` lines, clamped via the pure scroll seam
   * against the flattened keymap for the current focus/tab. The detail tab is
   * read from the open detail state so the leading group matches the overlay.
   */
  private scrollHelp(delta: number): void {
    const scope = scopeForFocus(this.app.focus, this.detail?.tab ?? null);
    const total = helpLines(scope).length;
    const vh = this.helpViewportHeight();
    const next = scrollBy({ offset: this.helpScroll }, delta, total, vh);
    if (next.offset !== this.helpScroll) {
      this.helpScroll = next.offset;
      this.bump();
    }
  }

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

  /**
   * Kind labels valid for the active context: the static sidebar leaves plus
   * any CRD-derived kinds (Strimzi's Kafka/KafkaTopic) detected for this
   * cluster. Used to validate a remembered `activeKind` on restore (chunk 08
   * §4) — a kind the new cluster lacks falls back to Overview.
   */
  private availableKindLabels(): string[] {
    const labels: string[] = [];
    for (const cat of SIDEBAR_CATEGORIES) {
      for (const leaf of cat.children) {
        labels.push(leaf.label);
      }
    }
    if (this.kafkaDetected.deploymentType !== 'none') {
      labels.push('Kafka', 'KafkaTopic');
    }
    return labels;
  }

  private switchContext(ctx: string): void {
    // Save the OUTGOING context's view before tearing it down (chunk 08 §4).
    this.persistContextMemory(this.app.context);

    this.streams?.stop();
    this.kc.setCurrentContext(ctx);
    this.client = new KubeClientAdapter(this.kc);
    this.store = new StateStore((event) => normalize(event.object));
    this.store.subscribe(() => {
      this.onStoreChanged();
    });

    // Restore the INCOMING context's remembered view, validated against what
    // exists now. Namespaces have not loaded yet, so the namespace is restored
    // lazily once they do (pendingNamespaceRestore); the kind is validated
    // against the static/CRD kind list immediately.
    const restored = restoreContext(this.contextMemory, ctx, {
      availableKinds: this.availableKindLabels(),
      availableNamespaces: [],
    });
    const remembered = this.contextMemory[ctx];
    this.pendingNamespaceRestore =
      remembered !== undefined && remembered.namespace !== ''
        ? { ctx, namespace: remembered.namespace }
        : null;

    this.switchStatus = beginSwitch(ctx);
    this.app = {
      ...this.app,
      context: ctx,
      namespace: '',
      allNamespaces: [],
      badgeCounts: new Map(),
      dimmedKinds: new Set(),
      forbiddenKinds: new Set(),
      activeKind: restored.activeKind,
      showDetail: false,
      switchStatus: this.switchStatus,
    };
    this.detail = null;
    this.stopLogs();
    this.table = null;
    this.health = { summary: emptySummary(), rules: [], showPassing: false };
    if (restored.activeKind === 'Overview') {
      this.columns = [];
    } else {
      this.seedTable(restored.activeKind);
    }
    this.cursorKind = restored.activeKind;
    this.startStreams();
    void this.badgeSweep();
  }

  /** Record `ctx`'s current `{ namespace, activeKind }` in memory + persist. */
  private persistContextMemory(ctx: string): void {
    this.contextMemory = rememberContext(this.contextMemory, ctx, {
      namespace: this.app.namespace,
      activeKind: this.app.activeKind,
    });
    this.saveLayout();
  }

  // -------------------------------------------------------------------------
  // Detail pane
  // -------------------------------------------------------------------------

  private openDetail(resource: ResourceObject, tab: TabId): void {
    // Re-open on the kind's last-used tab when entering via plain Enter.
    const remembered =
      tab === 'overview' ? this.tabByKind.get(resource.kind) : undefined;
    const effectiveTab = remembered ?? tab;
    this.detail = {
      uid: resource.uid,
      resource,
      tab: effectiveTab,
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
    if (tab === 'metrics') {
      void this.fetchCharts();
    }
    this.charts = null;
    // Spec 03: a freshly-opened resource starts at its tab's top.
    this.resetDetailOffset();
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
      selection: 'confirm',
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
    try {
      if (process.platform === 'darwin') {
        const child = spawn('pbcopy');
        child.stdin.write(resource.name);
        child.stdin.end();
      } else {
        // OSC-52: terminal-native clipboard, works over ssh/tmux too.
        const b64 = Buffer.from(resource.name).toString('base64');
        process.stdout.write(`\x1b]52;c;${b64}\x07`);
      }
      this.setHints([`✓ Copied ${resource.name}`]);
    } catch {
      // Clipboard unavailable — non-fatal.
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
    this.enginePromise ??= TransformersInferenceEngine.create(
      this.agentModelId,
    );
    return this.enginePromise;
  }

  /**
   * Tool subset exposed to the model when tool-calling is enabled. Each tool
   * schema costs ~100 prompt tokens per round and a tool round-trip doubles
   * the rounds, so tools are enabled adaptively: only when the model's chat
   * template supports them AND the measured warmup round is fast enough for
   * a two-round exchange to fit the configured timeout.
   */
  private static readonly AGENT_TOOLS = new Set<string>([
    'list_resources',
    'count_resources',
    'get_pod_detail',
    'find_erroring_pods',
  ]);

  private toolsEnabled = false;

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
        log.debug('engine loaded');
        const warmupStart = this.clock.now();
        return engine
          .generate({
            messages: [{ role: 'user', content: 'Reply with the word ok.' }],
            tools: [],
            thinking: false,
          })
          .then(() => this.clock.now() - warmupStart);
      })
      .then((warmupMs) => {
        // Enable tool-calling only when a two-round exchange plausibly fits
        // the timeout: the warmup is a tiny prompt, a real round costs
        // roughly 10x it, and tools double the rounds.
        this.toolsEnabled =
          modelSupportsTools(this.agentModelId) &&
          warmupMs * 20 < this.agentTimeoutMs;
        log.debug(
          { warmupMs, toolsEnabled: this.toolsEnabled },
          'engine warmup',
        );
      })
      .catch((e: unknown) => {
        log.error({ err: String(e) }, 'engine load failed');
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
      kafkaClusters:
        this.kafkaDetected.deploymentType === 'none'
          ? []
          : this.store.list(this.app.context, 'Kafka').map((cluster) => ({
              clusterName: cluster.name,
              brokerCount: 1,
              topicCount: this.store.list(this.app.context, 'KafkaTopic')
                .length,
              lagSummary:
                this.kafkaLagByTopic.size === 0
                  ? 'lag unknown'
                  : `max lag ${String(Math.max(0, ...this.kafkaLagByTopic.values()))}`,
            })),
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

    log.debug(
      {
        systemChars: system.length,
        totalChars: messages.reduce((a, m) => a + m.content.length, 0),
      },
      'agent prompt built',
    );
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
        log.debug({ tool: toolName, params }, 'agent tool call');
        this.setHints([`> ${humanizeToolCall(toolName, params)}`]);
      },
      tools: this.toolsEnabled
        ? buildToolDefinitions().filter((tool) =>
            LiveController.AGENT_TOOLS.has(tool.name),
          )
        : [],
      timeoutMs: this.agentTimeoutMs,
    });

    log.debug(
      { result: result.kind, ms: this.clock.now() - t0 },
      'agent round done',
    );
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
        log.warn({ raw: result.raw.slice(0, 400) }, 'agent parse error');
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
        selection: 'confirm',
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
    // Hard-disable mouse modes before handing the terminal back (Spec 01 §3.5).
    this.mouse.tearDown();
    this.onExit();
  }

  // -------------------------------------------------------------------------
  // Logs (Spec 05 §3)
  // -------------------------------------------------------------------------

  /**
   * Open Logs for a pod (B06 / Spec 05 §3.1, amended). No blocking full-screen
   * picker: compute the container set and **stream the default container
   * immediately**. Three cases follow `buildContainerPicker`:
   *   - `options.length === 0` → "✗ No containers found" hint, stop.
   *   - `defaultIndex >= 0` → stream `options[defaultIndex]` right away.
   *   - `defaultIndex < 0` (all terminated/waiting) → stream nothing and
   *     auto-open the inline container dropdown.
   */
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
    if (picker.options.length === 0) {
      this.setHints(['✗ No containers found']);
      return;
    }
    const hasDefault = picker.defaultIndex >= 0;
    const index = Math.max(picker.defaultIndex, 0);
    const container = picker.options[index]?.name ?? '';
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
      offset: 0,
      containerPickerOpen: !hasDefault,
      containerPickerIndex: index,
      lineLimitOpen: false,
      lineLimitIndex: LINE_OPTIONS.findIndex(
        (o) => o.id === DEFAULT_LINE_OPTION,
      ),
      confirmation: undefined,
      stop: null,
    };
    if (hasDefault) {
      this.startLogStream();
    } else {
      // All containers terminated/waiting: wait for the user to choose one.
      this.bump();
    }
  }

  private startLogStream(): void {
    const l = this.logs;
    if (l === null) {
      return;
    }
    l.stop?.();
    l.ring = new RingBuffer(10_000);
    l.newLines = 0;
    // A restarted stream tails the newest lines again.
    l.live = true;
    l.offset = 0;
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

    // An open inline dropdown (B06) captures navigation keys before scrolling:
    // ↑/↓ (and j/k) move the highlight, Enter selects, Esc closes unchanged.
    if (l.containerPickerOpen) {
      return this.handleContainerDropdownKey(input, key);
    }
    if (l.lineLimitOpen) {
      return this.handleLineLimitDropdownKey(input, key);
    }

    // Viewport scrolling (Spec 03): motion keys walk the ring buffer; scrolling
    // up off the bottom pauses the tail, returning to the bottom resumes it.
    if (this.scrollLogs(input, key)) {
      return true;
    }

    if (input === '/') {
      l.searchFocused = true;
      this.bump();
      return true;
    }
    if (input === 'n' && l.searchQuery !== '') {
      this.jumpLogsSearch('next');
      return true;
    }
    if (input === 'N' && l.searchQuery !== '') {
      this.jumpLogsSearch('prev');
      return true;
    }
    if (input === 'p') {
      l.live = !l.live;
      if (l.live) {
        l.newLines = 0;
        l.offset = this.logsBottomOffset();
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
      // Re-clamp the offset after a wrap change re-projects the lines.
      l.offset = clampOffset(
        l.offset,
        l.ring.toArray().length,
        this.logsViewportHeight(),
      );
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
    // `o` opens/closes the inline container dropdown (B06; plain `c` is reserved
    // for the chunk-08 context switcher — no blind container cycle anymore).
    if (input === LOGS_TOOLBAR_ACCELERATORS['logs.container']) {
      this.toggleContainerDropdown();
      return true;
    }
    // `l` opens/closes the inline line-limit dropdown (replaces the `L` cycle).
    if (input === LOGS_TOOLBAR_ACCELERATORS['logs.lineLimit']) {
      this.toggleLineLimitDropdown();
      return true;
    }
    if (input === LOGS_TOOLBAR_ACCELERATORS['logs.download']) {
      void this.downloadCurrentLogs();
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Inline Logs dropdowns (B06). The open/highlight state lives on the logs
  // model (separate from the generic `this.picker`); these methods toggle it,
  // move the highlight via the pure `clampIndex`, and apply the selection by
  // reusing the existing container-switch / line-limit stream-restart paths.
  // -------------------------------------------------------------------------

  /** Toggle the container dropdown (accelerator `o`). */
  private toggleContainerDropdown(): void {
    this.setContainerDropdownOpen(!(this.logs?.containerPickerOpen ?? false));
  }

  /** Toggle the line-limit dropdown (accelerator `l`). */
  private toggleLineLimitDropdown(): void {
    this.setLineLimitDropdownOpen(!(this.logs?.lineLimitOpen ?? false));
  }

  /**
   * Set the container dropdown's open state. Opening resets the highlight to the
   * current container and closes the line-limit dropdown (only one open at a
   * time). Click parity uses this so it never re-toggles after a selection.
   */
  setContainerDropdownOpen = (open: boolean): void => {
    const l = this.logs;
    if (l === null) {
      return;
    }
    l.containerPickerOpen = open;
    if (open) {
      l.lineLimitOpen = false;
      const idx = l.containers.findIndex((c) => c.name === l.container);
      l.containerPickerIndex = idx < 0 ? 0 : idx;
    }
    this.bump();
  };

  /** Set the line-limit dropdown's open state (mirror of the container one). */
  setLineLimitDropdownOpen = (open: boolean): void => {
    const l = this.logs;
    if (l === null) {
      return;
    }
    l.lineLimitOpen = open;
    if (open) {
      l.containerPickerOpen = false;
      const idx = LINE_OPTIONS.findIndex((o) => o.id === l.limit);
      l.lineLimitIndex = idx < 0 ? 0 : idx;
    }
    this.bump();
  };

  /** Keyboard handling while the container dropdown is open. */
  private handleContainerDropdownKey(input: string, key: InkKey): boolean {
    const l = this.logs;
    if (l === null) {
      return false;
    }
    if (key.escape) {
      l.containerPickerOpen = false;
      this.bump();
      return true;
    }
    if (key.return) {
      this.selectContainerByIndex(l.containerPickerIndex);
      return true;
    }
    if (key.downArrow || input === 'j') {
      l.containerPickerIndex = clampIndex(
        l.containerPickerIndex,
        1,
        l.containers.length,
      );
      this.bump();
      return true;
    }
    if (key.upArrow || input === 'k') {
      l.containerPickerIndex = clampIndex(
        l.containerPickerIndex,
        -1,
        l.containers.length,
      );
      this.bump();
      return true;
    }
    return true;
  }

  /** Keyboard handling while the line-limit dropdown is open. */
  private handleLineLimitDropdownKey(input: string, key: InkKey): boolean {
    const l = this.logs;
    if (l === null) {
      return false;
    }
    if (key.escape) {
      l.lineLimitOpen = false;
      this.bump();
      return true;
    }
    if (key.return) {
      this.selectLineLimitByIndex(l.lineLimitIndex);
      return true;
    }
    if (key.downArrow || input === 'j') {
      l.lineLimitIndex = clampIndex(l.lineLimitIndex, 1, LINE_OPTIONS.length);
      this.bump();
      return true;
    }
    if (key.upArrow || input === 'k') {
      l.lineLimitIndex = clampIndex(l.lineLimitIndex, -1, LINE_OPTIONS.length);
      this.bump();
      return true;
    }
    return true;
  }

  /**
   * Switch the streamed container to `containers[index]` and close the dropdown.
   * No-op (just closes) if the index is out of range or already current.
   */
  selectContainerByIndex = (index: number): void => {
    const l = this.logs;
    if (l === null) {
      return;
    }
    l.containerPickerOpen = false;
    const chosen = l.containers[index];
    if (chosen === undefined) {
      this.bump();
      return;
    }
    if (chosen.name !== l.container) {
      l.container = chosen.name;
      l.previous = false;
      this.startLogStream();
    } else {
      this.bump();
    }
  };

  /**
   * Set the line limit to `LINE_OPTIONS[index]` and restart the stream; close
   * the dropdown. No-op restart if the index is out of range.
   */
  selectLineLimitByIndex = (index: number): void => {
    const l = this.logs;
    if (l === null) {
      return;
    }
    l.lineLimitOpen = false;
    const chosen = LINE_OPTIONS[index];
    if (chosen === undefined) {
      this.bump();
      return;
    }
    l.limit = chosen.id;
    this.startLogStream();
  };

  /** Toggle a Logs toolbar control by its registry id (mouse-click parity). */
  logsToolbarAction = (id: string): void => {
    const l = this.logs;
    if (l === null) {
      return;
    }
    switch (id) {
      case 'logs.container':
        this.toggleContainerDropdown();
        return;
      case 'logs.lineLimit':
        this.toggleLineLimitDropdown();
        return;
      case 'logs.pause':
        l.live = !l.live;
        if (l.live) {
          l.newLines = 0;
          l.offset = this.logsBottomOffset();
        }
        this.bump();
        return;
      case 'logs.timestamps':
        l.timestamps = !l.timestamps;
        this.bump();
        return;
      case 'logs.wrap':
        l.wrap = !l.wrap;
        l.offset = clampOffset(
          l.offset,
          l.ring.toArray().length,
          this.logsViewportHeight(),
        );
        this.bump();
        return;
      case 'logs.download':
        void this.downloadCurrentLogs();
        return;
      default:
        return;
    }
  };

  /** The offset that pins the Logs viewport to the newest lines. */
  private logsBottomOffset(): number {
    const l = this.logs;
    if (l === null) {
      return 0;
    }
    return maxOffset(l.ring.toArray().length, this.logsViewportHeight());
  }

  /**
   * Apply a new Logs scroll offset and re-couple the live flag: at the bottom
   * the tail resumes (and the "new lines" badge clears); above it the tail
   * pauses. Returns whether anything changed (always true here — callers gate).
   */
  private applyLogsOffset(next: ScrollState): void {
    const l = this.logs;
    if (l === null) {
      return;
    }
    const total = l.ring.toArray().length;
    const vh = this.logsViewportHeight();
    const offset = clampOffset(next.offset, total, vh);
    const live = logsLiveAfterScroll({ offset }, total, vh);
    l.offset = offset;
    l.live = live;
    if (live) {
      l.newLines = 0;
    }
    this.bump();
  }

  /**
   * Handle a Logs viewport motion key (`↑/↓`, PageUp/PageDown, Home/End,
   * `g`/`G`). Returns true when the key drove the viewport.
   */
  private scrollLogs(input: string, key: InkKey): boolean {
    const l = this.logs;
    if (l === null) {
      return false;
    }
    const total = l.ring.toArray().length;
    const vh = this.logsViewportHeight();
    // While live the offset trails the bottom; start from there so the first
    // up-arrow steps off the newest line rather than from a stale value.
    const start: ScrollState = {
      offset: l.live ? maxOffset(total, vh) : l.offset,
    };
    if (key.upArrow) {
      this.applyLogsOffset(scrollBy(start, -1, total, vh));
      return true;
    }
    if (key.downArrow) {
      this.applyLogsOffset(scrollBy(start, 1, total, vh));
      return true;
    }
    if (key.pageUp) {
      this.applyLogsOffset(pageBy(start, 'up', total, vh));
      return true;
    }
    if (key.pageDown) {
      this.applyLogsOffset(pageBy(start, 'down', total, vh));
      return true;
    }
    if (input === 'g') {
      // `g` jumps to the top, `G` to the bottom (vi-style).
      this.applyLogsOffset(toTop());
      return true;
    }
    if (input === 'G') {
      this.applyLogsOffset(toBottom(total, vh));
      return true;
    }
    return false;
  }

  /** Advance the Logs search cursor and scroll the match into view. */
  private jumpLogsSearch(dir: 'next' | 'prev'): void {
    const l = this.logs;
    if (l === null) {
      return;
    }
    const view = this.buildLogsView();
    if (view === null) {
      return;
    }
    const stepped =
      dir === 'next' ? nextMatch(view.search) : prevMatch(view.search);
    l.searchCurrent = stepped.current;
    // Recompute against the full (non-window-shifted) projection to find the
    // absolute match line, then scroll it into view and pause the tail.
    const display = projectLogsView({
      raw: l.ring.toArray(),
      offset: l.offset,
      viewportHeight: this.logsViewportHeight(),
      timestamps: l.timestamps,
      live: false,
    }).display;
    const matches = runSearch(display, l.searchQuery).matches;
    const matchLine = matches[stepped.current] ?? -1;
    const next = offsetForMatch(
      l.offset,
      matchLine,
      display.length,
      this.logsViewportHeight(),
    );
    this.applyLogsOffset({ offset: next });
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
    this.pickContainer(resource, 'Exec — choose container', (container) => {
      void this.openExecPrompt(resource, container);
    });
  }

  private async openExecPrompt(
    resource: ResourceObject,
    container: string,
  ): Promise<void> {
    const history = await loadHistory(this.fileSink);
    this.execPrompt = {
      resource,
      container,
      input: new CommandInput(history, ''),
    };
    this.app = { ...this.app, focus: 'commandbar', mode: 'command' };
    this.bump();
  }

  private handleExecPromptInput(input: string, key: InkKey): void {
    const prompt = this.execPrompt;
    if (prompt === null) {
      return;
    }
    if (key.escape) {
      this.execPrompt = null;
      this.app = { ...this.app, focus: 'list', mode: 'normal' };
      this.bump();
      return;
    }
    if (key.return) {
      const command = resolveCommand(prompt.input.value);
      void appendHistory(this.fileSink, command);
      this.execPrompt = null;
      this.app = { ...this.app, focus: 'list', mode: 'normal' };
      this.bump();
      this.execInto(prompt.resource, prompt.container, command);
      return;
    }
    if (key.upArrow) {
      prompt.input.up();
      this.bump();
      return;
    }
    if (key.downArrow) {
      prompt.input.down();
      this.bump();
      return;
    }
    if (key.backspace || key.delete) {
      prompt.input.setBuffer(prompt.input.value.slice(0, -1));
      this.bump();
      return;
    }
    if (input.length >= 1 && !key.ctrl && !key.meta && !key.tab) {
      prompt.input.setBuffer(prompt.input.value + input);
      this.bump();
    }
  }

  private execInto(
    resource: ResourceObject,
    container: string,
    command: string = DEFAULT_COMMAND,
  ): void {
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
              command === DEFAULT_COMMAND
                ? 'command -v bash >/dev/null 2>&1 && exec bash || exec sh'
                : command,
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

  // -------------------------------------------------------------------------
  // Mouse routing (Spec 01 §3.5, Spec 04 / B04a). One SGR stdin stream →
  // parseSgrMouseChunk → the pure `dispatch` reducer over a frame-derived
  // registry snapshot → an Action this controller executes. No geometry
  // arithmetic lives in the handlers; coordinates are 0-based (matching
  // computeFrame) after the single 1-based→0-based conversion in
  // handleStdinChunk.
  // -------------------------------------------------------------------------

  /** Replicates the Sidebar component's cursor-centered window math. */
  private sidebarWindow(): {
    keys: string[];
    offset: number;
    clippedTop: boolean;
  } {
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
    const viewportHeight = Math.max(5, this.terminalRows - 3);
    if (keys.length <= viewportHeight) {
      return { keys, offset: 0, clippedTop: false };
    }
    const content = viewportHeight - 2;
    const cursorIdx = Math.max(0, keys.indexOf(this.cursorKind));
    const offset = Math.min(
      Math.max(0, cursorIdx - Math.floor(content / 2)),
      Math.max(0, keys.length - content),
    );
    return { keys, offset, clippedTop: offset > 0 };
  }

  // The drag-resize latch: once a press lands on a border handle, every drag
  // routes to it until release (no slip). Pure dispatch decides; we hold state.
  private dragLatch: DragLatch = null;

  // -------------------------------------------------------------------------
  // Measured-widget registry (B04b). The four React wrappers (`Button`,
  // `FocusableRegion`, `SelectableList`, `DropdownButton` in
  // src/adapters/live/) measure their absolute rect in a `useEffect` and call
  // registerMeasured / unregisterMeasured. registry() merges these onto the
  // frame-derived snapshot so the *same* pure dispatcher routes them — Button
  // entries also carry an `onClick`, looked up by id when a `buttonPress`
  // action fires. All decisions stay pure (measure.ts / dispatch.ts); the
  // controller only stores the entries and runs the handler.
  // -------------------------------------------------------------------------
  private measured = new Map<string, HitEntry>();
  private buttonHandlers = new Map<string, () => void>();

  /**
   * Register (or replace) a measured hit-target by id. Buttons pass an
   * `onClick`; it is invoked when the pure dispatcher returns a `buttonPress`
   * for this id. Idempotent per id, so a re-measure on resize just overwrites.
   */
  registerMeasured = (entry: HitEntry, onClick?: () => void): void => {
    const id = entry.id;
    if (id === undefined) {
      return;
    }
    // Always store the latest handler (looked up by id at press time — a fresh
    // closure with identical geometry must still fire the current callback).
    if (onClick !== undefined) {
      this.buttonHandlers.set(id, onClick);
    }
    const prev = this.measured.get(id);
    this.measured.set(id, entry);
    // Idempotent at the seam: a re-register that lands a value-equal entry must
    // NOT churn the snapshot, or the measured wrappers' commit-time re-register
    // would notify `useSyncExternalStore` → re-render → re-register forever.
    // Real changes (rect moved on resize, new id, new selection) still notify.
    if (prev !== undefined && entriesEqual(prev, entry)) {
      return;
    }
    this.bump();
  };

  /** Remove a measured hit-target on unmount. */
  unregisterMeasured = (id: string): void => {
    const had = this.measured.delete(id);
    this.buttonHandlers.delete(id);
    // Only notify when something was actually removed (a no-op delete of an
    // already-absent id must not churn the snapshot).
    if (had) {
      this.bump();
    }
  };

  /**
   * Build the frame-derived hit-test registry snapshot for the current layout:
   * the focusable regions (sidebar, list, detail, command bar) plus the two
   * draggable border handles. B04b's measured `<Button>` / `<SelectableList>`
   * wrappers will register their entries onto this same snapshot model.
   *
   * The sidebar is modeled as a `list` so a press maps to a row index against
   * its cursor-centered window; the resource list carries its scroll offset and
   * the selected index so the dispatcher can decide select-vs-open-detail
   * without any geometry of its own.
   */
  private registry(): RegistrySnapshot {
    const frame = this.frame();
    const entries: HitEntry[] = [];

    // Sidebar: a list whose rowOffset folds in the window offset and the
    // optional "↑ …" clipped-top indicator row.
    const win = this.sidebarWindow();
    entries.push({
      kind: 'list',
      region: 'sidebar',
      rect: frame.sidebar,
      layer: 0,
      rowOffset: win.offset - (win.clippedTop ? 1 : 0),
    });

    // Resource list: rowOffset = the table's scroll offset; selectedIndex
    // drives the second-click-opens-detail rule.
    const listEntry: HitEntry = {
      kind: 'list',
      region: 'list',
      rect: frame.list,
      layer: 0,
      rowOffset: this.table?.scrollOffset ?? 0,
      ...(this.app.focus === 'list'
        ? { selectedIndex: this.selectedIndex }
        : {}),
    };
    entries.push(listEntry);

    if (frame.detail !== null) {
      entries.push({
        kind: 'region',
        region: 'detail',
        rect: frame.detail,
        layer: 0,
      });
    }
    entries.push({
      kind: 'region',
      region: 'commandbar',
      rect: frame.commandBar,
      layer: 0,
    });

    // The two shared border lines, as draggable handles. The dispatcher applies
    // a ±1-cell grab tolerance, so the thin lines are easy to grab.
    entries.push({
      kind: 'handle',
      handle: 'sidebar',
      rect: segmentRect(frame.handles.sidebar),
      layer: 0,
    });
    if (frame.handles.vertical !== null) {
      entries.push({
        kind: 'handle',
        handle: 'vertical',
        rect: segmentRect(frame.handles.vertical),
        layer: 0,
      });
    }
    // Measured widgets (tabs, ✕, header chips, dropdown overlays) register last
    // so they win equal-layer ties; the nested-Button winner rule in
    // pressTarget routes a click on a Button over its region to the Button.
    for (const entry of this.measured.values()) {
      entries.push(entry);
    }
    return entries;
  }

  /**
   * Hit-test registry while a confirm dialog is open: only its measured
   * [confirm]/[cancel] Buttons, so a click anywhere else is a no-op (B3b).
   */
  private confirmRegistry(): RegistrySnapshot {
    const entries: HitEntry[] = [];
    for (const entry of this.measured.values()) {
      if (entry.id?.startsWith('confirm.') === true) {
        entries.push(entry);
      }
    }
    return entries;
  }

  /** The session's mouse-mode lifecycle (enable / idempotent teardown). */
  mouseLifecycle(): MouseLifecycle {
    return this.mouse;
  }

  /**
   * Parse one raw stdin read into its SGR mouse events and route each. A single
   * read may carry several reports (terminals coalesce rapid motion — CLAUDE.md
   * gotcha); {@link parseSgrMouseChunk} splits them. SGR coordinates are 1-based;
   * we subtract 1 at this single seam so everything downstream is 0-based and
   * agrees with `computeFrame`.
   */
  handleStdinChunk(chunk: string): void {
    for (const event of parseSgrMouseChunk(chunk)) {
      this.handleMouseEvent({ ...event, x: event.x - 1, y: event.y - 1 });
    }
  }

  /**
   * Route one parsed SGR mouse event (already 0-based). Overlays (confirm/help/
   * context switcher/port-forward manager/picker) swallow mouse input for now;
   * otherwise the pure {@link dispatchMouse} reducer decides the action and we
   * execute it.
   */
  handleMouseEvent(event: MouseEvent): void {
    if (
      this.app.helpOpen ||
      this.app.contextSwitcherOpen ||
      this.pfManagerOpen ||
      this.picker !== null
    ) {
      return;
    }
    // While a confirm dialog is open, only its own [confirm]/[cancel] Buttons
    // (registered on the overlay layer) may be clicked — everything else is
    // swallowed so a click can't act on the list behind the prompt (B3b).
    if (this.confirm !== null) {
      const result = dispatchMouse(event, this.confirmRegistry(), null);
      this.executeMouseAction(result.action);
      return;
    }
    const result = dispatchMouse(event, this.registry(), this.dragLatch);
    this.dragLatch = result.latch;
    this.executeMouseAction(result.action);
  }

  private executeMouseAction(action: MouseAction): void {
    switch (action.kind) {
      case 'none':
        return;
      case 'focusRegion': {
        if (action.region === 'commandbar') {
          // Command bar click focuses the agent input (Spec 02 §7).
          this.commandOpen = true;
          this.inputText = '';
          this.app = { ...this.app, mode: 'command', focus: 'commandbar' };
          this.bump();
          return;
        }
        this.setFocus(action.region);
        return;
      }
      case 'selectRow': {
        if (action.region === 'sidebar') {
          this.clickSidebarRow(action.index);
          return;
        }
        this.clickListRow(action.index, false);
        return;
      }
      case 'openDetailRow': {
        if (action.region === 'sidebar') {
          this.clickSidebarRow(action.index);
          return;
        }
        this.clickListRow(action.index, true);
        return;
      }
      case 'buttonPress': {
        // Run the handler the measured <Button> registered for this id.
        this.buttonHandlers.get(action.id)?.();
        return;
      }
      case 'beginDrag':
        this.setFocus(action.handle === 'sidebar' ? 'sidebar' : 'detail');
        return;
      case 'dragTo': {
        this.applyDragRatio(action.handle, action.x, action.y);
        return;
      }
      case 'endDrag':
        this.saveLayout();
        return;
      case 'wheel': {
        this.wheelRegion(action.region, action.dir);
        return;
      }
    }
  }

  /** Apply a sidebar-row press: focus, select the kind, toggle a category. */
  private clickSidebarRow(index: number): void {
    const win = this.sidebarWindow();
    const key = win.keys[index];
    if (key === undefined) {
      this.setFocus('sidebar');
      return;
    }
    this.cursorKind = key;
    this.setFocus('sidebar');
    if (key === 'Overview') {
      this.selectKind('Overview');
    } else if (SIDEBAR_CATEGORIES.some((cat) => cat.id === key)) {
      this.toggleCategory(key);
    } else {
      this.selectKind(key);
      this.setFocus('list');
    }
    this.bump();
  }

  /** Apply a resource-list press: select the row, or open detail when asked. */
  private clickListRow(index: number, openDetail: boolean): void {
    if (this.table === null) {
      this.setFocus('list');
      return;
    }
    const rows = getSortedFilteredRows(this.table);
    if (index < 0 || index >= rows.length) {
      this.setFocus('list');
      return;
    }
    if (openDetail) {
      const resource = rows[index]?.resource;
      if (resource !== undefined) {
        this.openDetail(resource, 'overview');
        return;
      }
    }
    this.selectedIndex = index;
    this.setFocus('list');
    this.bump();
  }

  /** Re-derive and store the pane ratio implied by a drag cursor position. */
  private applyDragRatio(
    handle: 'sidebar' | 'vertical',
    x: number,
    y: number,
  ): void {
    if (handle === 'sidebar') {
      this.app = {
        ...this.app,
        sidebarRatio: sidebarRatioFromX(this.terminalColumns, x),
      };
    } else {
      if (!this.app.showDetail) {
        return;
      }
      this.app = {
        ...this.app,
        verticalRatio: verticalRatioFromY(this.frame(), y),
      };
    }
    this.bump();
  }

  /** Scroll the region under the wheel cursor (focus-independent, Spec 02 §9). */
  private wheelRegion(region: FocusRegion, dir: 'up' | 'down'): void {
    const delta = dir === 'down' ? 1 : -1;
    switch (region) {
      case 'sidebar': {
        const win = this.sidebarWindow();
        const idx = Math.max(
          0,
          Math.min(
            win.keys.indexOf(this.cursorKind) + delta,
            win.keys.length - 1,
          ),
        );
        this.cursorKind = win.keys[idx] ?? this.cursorKind;
        this.bump();
        return;
      }
      case 'list': {
        if (this.table === null) {
          return;
        }
        const rows = getSortedFilteredRows(this.table);
        this.selectedIndex = Math.max(
          0,
          Math.min(this.selectedIndex + delta, rows.length - 1),
        );
        this.ensureVisible();
        this.bump();
        return;
      }
      case 'detail': {
        // Logs route through applyLogsOffset so tail pause/resume fires
        // (Spec 03 coupling); every other in-scope tab scrolls its own offset.
        if (this.detail?.tab === 'logs' && this.logs !== null) {
          const l = this.logs;
          const total = l.ring.toArray().length;
          const vh = this.logsViewportHeight();
          const start: ScrollState = {
            offset: l.live ? maxOffset(total, vh) : l.offset,
          };
          this.applyLogsOffset(scrollBy(start, delta * WHEEL_LINES, total, vh));
        } else if (this.detail !== null) {
          const total = this.detailTotalLines();
          const vh = this.detailViewportHeight();
          this.detailOffset = scrollBy(
            this.detailOffset,
            delta * WHEEL_LINES,
            total,
            vh,
          );
          this.bump();
        }
        return;
      }
      case 'commandbar':
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Modal pickers (namespace dropdown, container picker)
  // -------------------------------------------------------------------------

  private pickerView(): PickerViewState | null {
    if (this.picker === null) {
      return null;
    }
    const filtered = this.pickerFiltered();
    return {
      title: this.picker.title,
      items: filtered,
      selectedIndex: Math.min(
        this.picker.selectedIndex,
        Math.max(0, filtered.length - 1),
      ),
      filter: this.picker.filter,
    };
  }

  private pickerFiltered(): PickerItem[] {
    if (this.picker === null) {
      return [];
    }
    const f = this.picker.filter.toLowerCase();
    return f === ''
      ? this.picker.items
      : this.picker.items.filter((item) =>
          item.label.toLowerCase().includes(f),
        );
  }

  private openPicker(
    title: string,
    items: PickerItem[],
    selectedIndex: number,
    onPick: (value: string) => void,
  ): void {
    this.picker = {
      title,
      items,
      selectedIndex: Math.max(0, selectedIndex),
      filter: '',
      onPick,
    };
    this.bump();
  }

  private handlePickerInput(input: string, key: InkKey): void {
    const picker = this.picker;
    if (picker === null) {
      return;
    }
    if (key.escape) {
      this.picker = null;
      this.bump();
      return;
    }
    const filtered = this.pickerFiltered();
    if (key.return) {
      const item =
        filtered[Math.min(picker.selectedIndex, filtered.length - 1)];
      this.picker = null;
      this.bump();
      if (item !== undefined) {
        picker.onPick(item.value);
      }
      return;
    }
    if (key.downArrow || (input === 'j' && picker.filter === '')) {
      picker.selectedIndex = Math.min(
        picker.selectedIndex + 1,
        Math.max(0, filtered.length - 1),
      );
      this.bump();
      return;
    }
    if (key.upArrow || (input === 'k' && picker.filter === '')) {
      picker.selectedIndex = Math.max(picker.selectedIndex - 1, 0);
      this.bump();
      return;
    }
    if (key.backspace || key.delete) {
      picker.filter = picker.filter.slice(0, -1);
      picker.selectedIndex = 0;
      this.bump();
      return;
    }
    if (input.length >= 1 && !key.ctrl && !key.meta && !key.tab) {
      picker.filter += input;
      picker.selectedIndex = 0;
      this.bump();
    }
  }

  private openNamespacePicker(): void {
    const items: PickerItem[] = [
      { value: '', label: '(all namespaces)' },
      ...this.app.allNamespaces.map((ns) => ({ value: ns, label: ns })),
    ];
    const current = items.findIndex(
      (item) => item.value === this.app.namespace,
    );
    this.openPicker('Namespace', items, Math.max(0, current), (value) => {
      this.setNamespace(value);
    });
  }

  /** Container picker for logs/exec (Spec 05 §3.1). */
  private pickContainer(
    resource: ResourceObject,
    title: string,
    onPick: (container: string) => void,
  ): void {
    const picker = buildContainerPicker(resource.raw);
    if (picker.options.length === 0) {
      this.setHints(['✗ No containers found']);
      return;
    }
    if (picker.autoOpen && picker.defaultIndex >= 0) {
      const name = picker.options[picker.defaultIndex]?.name;
      if (name !== undefined) {
        onPick(name);
      }
      return;
    }
    const items: PickerItem[] = picker.options.map((option) => ({
      value: option.name,
      label: option.label,
      ...(option.phase !== 'running' ? { note: option.phase } : {}),
    }));
    this.openPicker(title, items, Math.max(0, picker.defaultIndex), onPick);
  }

  handleInput(input: string, key: InkKey): void {
    // SGR mouse reports leak past Ink's filter as the bare CSI body
    // (`[<0;60;24M`); the real click is handled off raw stdin in
    // handleStdinChunk. Drop the leaked payload here (see isLeakedMouseInput),
    // or its digits would be misread as `1`–`6` tab jumps in the detail pane
    // (B3a).
    if (isLeakedMouseInput(input)) {
      return;
    }
    // Terminals can deliver rapid keystrokes as one chunk ("jj"); split so
    // navigation handlers see single keypresses. Text-entry handlers append
    // per character, which is equivalent to appending the chunk.
    if (input.length > 1 && !key.ctrl && !key.meta && !key.return) {
      for (const ch of input) {
        this.handleInput(ch, key);
      }
      return;
    }
    // Ctrl+C is handled by Ink's exitOnCtrlC; q routing below.
    if (this.confirm !== null) {
      // The confirm dialog owns all input while open. Routing through the
      // controller (rather than the dialog's own `useInput`) keeps a single
      // source of truth, so Enter no longer leaks past the dialog to the list
      // (B3b). Enter activates the highlighted button; ←/→/Tab toggle it.
      this.handleConfirmInput(input, key);
      return;
    }
    if (this.execPrompt !== null) {
      this.handleExecPromptInput(input, key);
      return;
    }
    if (this.picker !== null) {
      this.handlePickerInput(input, key);
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
        return;
      }
      // ↑/↓ scroll the overlay (B09). The clamp lives in the pure scroll seam;
      // the controller only holds the offset. PageUp/PageDown page by a screen.
      if (key.upArrow) {
        this.scrollHelp(-1);
      } else if (key.downArrow) {
        this.scrollHelp(1);
      } else if (key.pageUp) {
        this.scrollHelp(-this.helpViewportHeight());
      } else if (key.pageDown) {
        this.scrollHelp(this.helpViewportHeight());
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
    // `q` quits from every region in normal navigation mode. Text-entry modes
    // (search/command/edit/namespace picker/Logs search) are handled earlier in
    // the dispatch, so reaching here means `q` is a quit, not a literal char.
    if (input === 'q') {
      this.quit();
      return;
    }
    // Escape closes the detail pane from any region while it is open; it never
    // quits. (Search/command/edit/overlay Escapes are consumed earlier.)
    if (key.escape && this.app.showDetail) {
      this.closeDetail();
      return;
    }
    // Error banner (chunk 08 §3): while a switch has failed, `r` retries the
    // connection and `c` reopens the switcher. Checked before the global `c`
    // and `r` so the banner's actions win while it is showing.
    if (this.switchStatus?.phase === 'error') {
      if (input === 'r') {
        this.retrySwitch();
        return;
      }
      if (input === 'c') {
        this.switchContextFromError();
        return;
      }
    }
    // `c` opens the context switcher (chunk 08 §1). Text-entry modes are handled
    // earlier in dispatch, so reaching here means `c` is the switch key.
    if (input === 'c') {
      this.openContextSwitcher();
      return;
    }
    if (input === '?') {
      this.helpScroll = 0;
      this.app = { ...this.app, helpOpen: true };
      this.bump();
      return;
    }
    if (input === '/') {
      // `/` is scoped to the focused region (Spec 02 region model). It opens
      // the global pod-list filter only from the list or sidebar. The Logs tab
      // claims `/` for its in-pane search earlier; every other detail tab has
      // no search, so `/` is a no-op there rather than leaking to the list
      // filter (B4).
      if (this.app.focus === 'list' || this.app.focus === 'sidebar') {
        this.app = { ...this.app, mode: 'search', headerFocus: 'search' };
        this.bump();
      }
      return;
    }
    if (input === 'n') {
      this.openNamespacePicker();
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
    // Tab / Shift+Tab cycle regions from EVERY region including detail.
    if (key.tab) {
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
    // Pane resize (Spec 02 §6.1): Alt+Up/Down (meta in Ink) or +/- adjust the
    // list/detail split while the detail pane is open.
    if (
      this.app.showDetail &&
      ((key.meta && key.upArrow) ||
        input === '+' ||
        (key.meta && key.downArrow) ||
        input === '-')
    ) {
      const grow = (key.meta && key.downArrow) || input === '-' ? -0.05 : 0.05;
      this.app = {
        ...this.app,
        verticalRatio: Math.min(
          0.8,
          Math.max(0.2, this.app.verticalRatio + grow),
        ),
      };
      this.saveLayout();
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
    const order = regionOrder(this.app.showDetail);
    this.setFocus(nextRegion(order, this.app.focus, reverse));
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
      } else if (entry.type === 'leaf') {
        const parent = SIDEBAR_CATEGORIES.find((cat) =>
          cat.children.some((leaf) => leaf.resourceKind === entry.resourceKind),
        );
        if (parent !== undefined) {
          this.cursorKind = parent.id;
          this.bump();
        }
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
    // List `←/→` pan the columns horizontally (Spec nav-05). The status dot +
    // Name columns stay pinned; the clamp/width math lives in list-horizontal.
    if (key.leftArrow || key.rightArrow) {
      this.scrollListHorizontal(key.rightArrow ? 1 : -1);
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
        this.selectedIndex + this.visibleHeight(),
        Math.max(0, rows.length - 1),
      );
      this.ensureVisible();
      this.bump();
      return;
    }
    if (key.ctrl && input === 'b') {
      this.selectedIndex = Math.max(
        this.selectedIndex - this.visibleHeight(),
        0,
      );
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

  /**
   * Pan the list columns horizontally by `delta` columns (Spec nav-05). All
   * width/clamp arithmetic lives in the pure `list-horizontal` module; this
   * only reads the current pane width and stores the clamped offset.
   */
  private scrollListHorizontal(delta: number): void {
    if (this.table === null) {
      return;
    }
    const widths = naturalWidths(this.columns);
    const pinned = pinnedCount(this.columns);
    const next = clampHOffset(
      this.columns,
      widths,
      pinned,
      this.tableWidth(),
      this.table.horizontalOffset + delta,
    );
    const updated = setHorizontalOffset(this.table, next);
    if (updated !== this.table) {
      this.table = updated;
      this.bump();
    }
  }

  private ensureVisible(): void {
    if (this.table === null) {
      return;
    }
    const offset = this.table.scrollOffset;
    if (this.selectedIndex < offset) {
      this.table = scrollUp(this.table, offset - this.selectedIndex);
    } else if (this.selectedIndex >= offset + this.visibleHeight()) {
      this.table = scrollDown(
        this.table,
        this.selectedIndex - (offset + this.visibleHeight()) + 1,
      );
    }
  }

  private handleDetailInput(input: string, key: InkKey): void {
    if (
      this.detail?.yamlMode !== undefined &&
      this.detail.yamlMode !== 'read'
    ) {
      return;
    }
    // Escape (close pane) is handled by the global dispatch before this runs.
    if (this.detail === null) {
      return;
    }
    // `←/→` switch tabs (previous/next, wrapping); `1`–`6` jump to a tab.
    const tabs = navigableTabsFor(
      this.detail.resource.kind,
      this.metricsTier === 'prometheus',
    );
    if (key.leftArrow) {
      const target = prevTab(tabs, this.detail.tab);
      if (target !== null) {
        this.setDetailTab(target);
      }
      return;
    }
    if (key.rightArrow) {
      const target = nextTab(tabs, this.detail.tab);
      if (target !== null) {
        this.setDetailTab(target);
      }
      return;
    }
    const jumped = jumpTab(tabs, input);
    if (jumped !== null) {
      this.setDetailTab(jumped);
      return;
    }
    // `↑/↓`, PageUp/PageDown, `g`/`G` scroll the active non-Logs tab's content
    // through the chunk-03 viewport (Logs has its own scroll path). Metrics
    // `[`/`]` range keys win over `g`/`G` only by falling through below.
    if (this.scrollDetail(input, key)) {
      return;
    }
    if (this.detail.tab === 'metrics' && (input === '[' || input === ']')) {
      const options = this.metricsRange.options;
      const idx = options.indexOf(this.metricsRange.selected);
      const next =
        options[
          (idx + (input === ']' ? 1 : options.length - 1)) % options.length
        ];
      if (next !== undefined) {
        this.setMetricsRange(next);
      }
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
