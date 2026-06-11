// LiveController — production composition layer (coverage-excluded glue,
// Spec 08 §5.2). Connects kubeconfig → KubeClientAdapter → StreamManager →
// StateStore → UI snapshot consumed by the Ink views. All decision logic is
// delegated to the covered pure modules (table model, fast-path, commands,
// health registry, rollups); this class only routes events and holds state.

import { spawn } from 'node:child_process';
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
import { KubeClientAdapter } from '../kube-client.adapter.js';
import { SystemClock } from '../system.adapter.js';
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

  start(): void {
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
      app: this.app,
      cursorKind: this.cursorKind,
      inputText: this.commandOpen ? this.inputText : '',
      table: this.table,
      columns: this.columns,
      selectedIndex: this.selectedIndex,
      detail: this.detail,
      confirm: this.confirm,
      health: this.health,
      agentExchanges: this.agentExchanges,
      nowMs: this.clock.now(),
    };
    return this.snapshot;
  };

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
    this.columns = getColumns(kind);
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
      this.bump();
    }
  };

  closeDetail = (): void => {
    this.detail = null;
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

    // Model-backed inference is wired in the agent phase; until the model is
    // available, record the query with a helpful unknown response.
    this.agentExchanges = [
      ...this.agentExchanges,
      {
        query: text,
        action: {
          action: 'unknown' as const,
          raw: 'The local model is not loaded. Try a direct phrase like "pods in kube-system".',
        },
      },
    ].slice(-20);
    this.openAgentTab();
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
    } else {
      const resource = this.selectedRow();
      if (resource !== null) {
        this.openDetail(resource, 'agent');
      }
    }
  }

  private quit(): void {
    this.dispose();
    this.onExit();
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

    // Normal mode — global keys
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
