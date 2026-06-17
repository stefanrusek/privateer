# Privateer — Metrics & Health Advisor Spec
**Spec:** 06-metrics  
**Status:** Draft  
**Depends on:** Spec 01 (Architecture), Spec 02 (Navigation & Layout), Spec 03 (Resource Model), Spec 04 (Core Views)

---

## 1. Goals

- Define Prometheus auto-discovery and metrics-server fallback
- Define sparkline rendering in resource list rows
- Define MetricsTab full chart rendering with configurable time ranges
- Define the Health Dashboard as the root landing view
- Define the best practices rule engine and rule catalog
- Define Kafka health checks for both Strimzi-managed and bare KRaft clusters

---

## 2. Metrics Data Sources

### 2.1 Source priority

Attempted in order per resource type:

| Priority | Source | Capability |
|---|---|---|
| 1 | Prometheus (auto-discovered) | Full history, all metrics, charts |
| 2 | k8s Metrics Server | Current values only, no history |
| 3 | None | Hide metric columns; show prompt in MetricsTab |

Source detection runs at startup and on context switch. Result stored in State Store as `cluster.metricsSource`.

### 2.2 Prometheus auto-discovery

Per Spec 01 §5. Discovery order:
1. Config override (`~/.config/p9r/config.yaml`)
2. `PROMETHEUS_URL` env var
3. ServiceMonitor CRD scan
4. Standard namespace probe (common Helm release names)
5. Pod annotation scan (`prometheus.io/scrape: "true"`)
6. None found → fall back to metrics-server

When Prometheus requires in-cluster access, `kubectl port-forward` is used to establish a tunnel (per Spec 01 OQ-2). The tunnel is managed alongside the port-forward manager (Spec 05) but listed separately as a system forward, not a user forward. If the tunnel fails, metrics degrade to the next source tier with the standard degraded indicator and the tunnel retries with backoff (same policy as watch streams).

### 2.2.1 Metric exporter detection

Prometheus being present does not imply specific metrics exist. After discovery, Privateer probes for the metric families it depends on (`GET /api/v1/series?match[]=<metric>`):

| Exporter | Probe metric | Unlocks |
|---|---|---|
| cAdvisor (kubelet, ~always present) | `container_cpu_usage_seconds_total` | Pod/node CPU & memory charts and sparklines |
| kube-state-metrics | `kube_pod_container_status_restarts_total` | Restart-over-time chart, replica-count chart |
| Kafka Exporter | `kafka_consumergroup_lag` | Consumer lag — Consumer Groups tab, lag charts, KFK lag rules |
| Strimzi/Kafka JMX metrics | `kafka_server_replicamanager_underreplicatedpartitions` | Broker health charts, KFK-006 |

Each chart in §4.3 degrades **individually** based on its exporter's availability — a missing exporter hides only its charts, with an inline note naming the missing exporter.

**Kafka Exporter is opt-in even with Strimzi** — `spec.kafkaExporter` must be set on the Kafka CR. When Kafka is detected but `kafka_consumergroup_lag` is absent, the Consumer Groups tab shows an actionable empty state:

```
 Consumer lag metrics unavailable — Kafka Exporter is not deployed.

 Strimzi: add to your Kafka resource and the operator deploys it:
   spec:
     kafkaExporter: {}

 Bare Kafka: deploy kafka-exporter (danielqsj/kafka-exporter)
 pointed at your brokers, with a ServiceMonitor or scrape annotation.
```

### 2.3 Metrics-server fallback

When only metrics-server is available:
- CPU and memory current values available for pods and nodes
- Privateer accumulates its own rolling sample buffer (last 40 samples per visible pod/node, in memory) from its regular polling — this powers **session-data sparklines** in list views and a session-bounded chart (up to ~20m of history) in the MetricsTab, clearly labeled `session data`
- Historical ranges (1h, 4h, 1d, 2d) remain Prometheus-only and are disabled in the range selector
- A prompt is shown at the top of the MetricsTab:
  ```
  ℹ Prometheus not found — showing current values only.
  Install Prometheus for historical charts and Kafka metrics.
  ```

### 2.4 Polling intervals

| Context | Interval |
|---|---|
| Background (off-screen resources) | Not polled |
| List view sparklines | 30s |
| MetricsTab (active, focused) | 10s |
| Health Dashboard | 60s |
| Kafka consumer lag (Consumer Groups tab) | 15s |

---

## 3. Sparklines in List View

Sparklines appear as an additional column in resource list views when Prometheus is available.

### 3.1 Appearance

```
 ● Name                  Namespace   Ready   CPU          Memory       Age
 ─────────────────────────────────────────────────────────────────────────
 ● order-api-7d9f-xk2p   default     1/1     ▁▂▂▃▄▃▂▁▂▃  ▄▄▄▄▄▅▄▄▄▄   2d
 ● payment-svc-3f8a-mn4q default     1/1     ▁▁▁▁▁▁▁▁▁▁  ▂▂▂▂▂▂▂▂▂▂   3d
```

- Sparkline width: 10 characters using Unicode block elements `▁▂▃▄▅▆▇█`
- Represents last 10 data points (one per poll interval = last ~5 minutes at 30s)
- Color:
  - green: below 70% of request/limit
  - yellow: 70–90% of request/limit
  - red: above 90% of request/limit, or no request/limit set and usage is high
  - grey: no data yet

### 3.2 Sparkline columns by resource type

| Resource | Sparkline columns |
|---|---|
| Pod | CPU, Memory |
| Node | CPU, Memory |
| Deployment | CPU (aggregate), Memory (aggregate) |
| StatefulSet | CPU (aggregate), Memory (aggregate) |
| KafkaTopic | Consumer lag (if Prometheus) |
| Kafka cluster | Under-replicated partitions |

Under metrics-server-only, sparklines render from Privateer's session buffer (§2.3) and carry a dim `~` prefix to indicate session-bounded data.

---

## 4. MetricsTab — Full Charts

### 4.1 Time range selector

```
 [20m] [1h] [4h] [1d] [2d]
```

Default: `1h`. Selection persisted per resource type per session.

### 4.2 Chart rendering

ASCII time-series charts rendered using Unicode block and Braille characters for resolution.

**Chart structure:**
```
 CPU Usage — order-api-7d9f-xk2p
 
 200m ┤                          ╭─╮
 150m ┤                    ╭─────╯ ╰──
 100m ┤           ╭──╮  ╭──╯
  50m ┤    ╭──────╯  ╰──╯
   0m ┼────┴──────────────────────────
      14:00      14:30          15:00
```

- Y-axis: auto-scaled with 4–5 labeled ticks
- X-axis: time labels at reasonable intervals based on selected range
- Chart width: fills available pane width
- Chart height: fixed at 8 rows

### 4.3 Metrics shown per resource type

**Pod:**
- CPU usage vs request vs limit (3 lines)
- Memory usage vs request vs limit (3 lines)
- Network I/O (bytes in/out, 2 lines)
- Restart count over time (bar)

**Node:**
- CPU usage % of allocatable
- Memory usage % of allocatable
- Pod count vs capacity
- Disk pressure (if available)

**Deployment / StatefulSet:**
- Aggregate CPU across all pods
- Aggregate memory across all pods
- Replica count over time

**Kafka cluster (Strimzi or bare):**
- Under-replicated partitions
- Active controller count
- Bytes in/out per second
- Request rate

**KafkaTopic:**
- Consumer lag per consumer group over time (one line per group)
- Bytes in/out per second
- Message rate

**KafkaConnect:**
- Task status (running/paused/failed count)
- Records in/out per second

### 4.4 Kafka lag chart — special rendering

The consumer lag chart is the primary diagnostic tool for Kafka. It needs to clearly show lag shape — spike-and-recovery vs plateau vs slow climb.

```
 Consumer Lag — orders-topic  [20m] [1h] [4h] [1d] [2d]

 50k ┤     ╭╮
 40k ┤     ││
 30k ┤    ╭╯│
 20k ┤    │ ╰─╮
 10k ┤  ╭─╯   ╰────────────────────
   0 ┼──╯──────────────────────────
      14:00              14:20

 ── order-service (0)   ── payment-service (2.1k)   ── analytics (48k ↑)
```

- One line per consumer group, color-coded
- Current lag value shown in the legend
- Trend indicator in legend: `↑` climbing, `↓` dropping, `→` stable
- Threshold bands drawn as subtle horizontal lines:
  - Yellow band at configured warning threshold (default 10k)
  - Red band at configured critical threshold (default 10k — same as warning by default, configurable)
- 20m default time range for lag (burst detection is the primary use case)

### 4.5 No metrics state

When neither Prometheus nor metrics-server is available:

```
 No metrics available

 Privateer could not find a Prometheus instance or metrics-server
 in this cluster.

 To enable metrics:
   • Install kube-prometheus-stack (recommended)
   • Or ensure metrics-server is running

 [Dismiss]
```

---

## 5. Health Dashboard

### 5.1 Placement

The root item of the left sidebar tree — above all resource groups. Labeled `⊕ Health` or `⊕ Overview`. Selecting it replaces the center top list with the Health Dashboard. It is the **default view on launch**.

### 5.2 Layout

```
 ╔══ Cluster Health — my-cluster ══════════════════════════════════════════╗
 ║                                                                         ║
 ║  SUMMARY                                                                ║
 ║  ● 142 pods running   ● 3 warnings   ✕ 1 error   ○ 2 pending          ║
 ║  Nodes: 5/5 ready   Namespaces: 8                                      ║
 ║                                                                         ║
 ║  BEST PRACTICES                                          12 issues      ║
 ║  ─────────────────────────────────────────────────────────────────────  ║
 ║  ✕ ERROR    3 pods have no resource limits set          [show]         ║
 ║  ⚠ WARN     default namespace has no NetworkPolicy      [show]         ║
 ║  ⚠ WARN     orders-topic: replication factor is 1       [show]         ║
 ║  ⚠ WARN     2 deployments have only 1 replica           [show]         ║
 ║  ✓ OK       All pods have liveness probes                              ║
 ║  ✓ OK       All secrets managed by Doppler                             ║
 ║                                                                         ║
 ║  METRICS OVERVIEW             (Prometheus ● connected)                 ║
 ║  ─────────────────────────────────────────────────────────────────────  ║
 ║  CPU      ▁▂▂▃▄▃▂▁▂▃  23% avg    Memory  ▄▄▄▄▄▅▄▄▄▄  61% avg        ║
 ║                                                                         ║
 ║  KAFKA                                                                  ║
 ║  ─────────────────────────────────────────────────────────────────────  ║
 ║  ● orders-topic      ── analytics-pipeline  48,291 lag  ↑ climbing    ║
 ║  ● payments-topic    All consumer groups healthy                       ║
 ║                                                                         ║
 ╚═════════════════════════════════════════════════════════════════════════╝
```

### 5.3 Summary section

- Live counts from State Store — updates via watch streams
- Clicking a count navigates to the relevant resource type with appropriate filter
  - Clicking `3 warnings` → navigates to Pods, filtered to warning status
  - Clicking `1 error` → navigates to Pods, filtered to error status

### 5.4 Best Practices section

- Rules evaluated against current State Store snapshot
- Re-evaluated every 60s and on manual refresh (`r`)
- Issues sorted: errors first, then warnings, then OK
- `[show]` navigates to the relevant resource(s) — e.g. clicking `[show]` on "3 pods have no resource limits" navigates to Pods and filters to those pods
- OK items collapsed by default — `[show passing]` toggle to expand

### 5.5 Metrics Overview section

- Cluster-wide CPU and memory sparklines (aggregate across all nodes)
- Prometheus connection status indicator
- Hidden if no metrics source available

### 5.6 Kafka section

- Shown only if Kafka detected (Strimzi CRDs or bare Kafka pods)
- Lists topics with consumer group lag summary
- Climbing lag shown prominently with `↑` indicator
- Clicking a topic navigates to KafkaTopic detail → Consumer Groups tab

---

## 6. Best Practices Rule Engine

### 6.1 Architecture

Rules are pure functions evaluated against the State Store:

```typescript
interface HealthRule {
  id: string;
  category: RuleCategory;
  severity: 'error' | 'warn' | 'info';
  title: (result: RuleResult) => string;
  evaluate: (store: StateStore) => RuleResult;
}

interface RuleResult {
  status: 'error' | 'warn' | 'ok';
  affectedResources: Array<{ kind: string; namespace: string; name: string }>;
  detail?: string;
}

type RuleCategory =
  | 'resources'      // CPU/memory limits and requests
  | 'reliability'    // replicas, disruption budgets
  | 'security'       // RBAC, secrets, network policies
  | 'networking'     // ingress, service config
  | 'storage'        // PVC, storage class
  | 'kafka'          // Kafka-specific
  | 'observability'; // probes, metrics
```

Rules are registered in a catalog and evaluated in parallel. Results are cached and invalidated on relevant watch events.

### 6.2 Rule Catalog — Workloads & Resources

| ID | Severity | Rule |
|---|---|---|
| `RES-001` | error | Pod has no CPU limit set |
| `RES-002` | error | Pod has no memory limit set |
| `RES-003` | warn | Pod has no CPU request set |
| `RES-004` | warn | Pod has no memory request set |
| `RES-005` | warn | CPU limit is more than 4x CPU request (noisy neighbor risk) |
| `REL-001` | warn | Deployment has only 1 replica (no redundancy) |
| `REL-002` | warn | Deployment has no PodDisruptionBudget |
| `REL-003` | warn | StatefulSet has only 1 replica |
| `REL-004` | info | CronJob has no concurrencyPolicy set |
| `OBS-001` | warn | Pod has no liveness probe |
| `OBS-002` | warn | Pod has no readiness probe |
| `OBS-003` | info | Pod has no startup probe (relevant for slow-starting apps) |

### 6.3 Rule Catalog — Security

| ID | Severity | Rule |
|---|---|---|
| `SEC-001` | error | Pod runs as root (`runAsRoot: true` or no `runAsNonRoot`) |
| `SEC-002` | warn | Pod has `allowPrivilegeEscalation: true` |
| `SEC-003` | warn | Namespace has no NetworkPolicy (traffic unrestricted) |
| `SEC-004` | warn | ServiceAccount has `automountServiceAccountToken: true` (default) with no usage |
| `SEC-005` | error | Opaque Secret with no managing operator (excludes `kubernetes.io/*` and `helm.sh/*` types, secrets with ownerReferences, and operator-managed outputs like DopplerSecret targets) |
| `SEC-006` | warn | ClusterRoleBinding grants cluster-admin to a non-system subject |
| `SEC-007` | info | Pod mounts a Secret as an env var (prefer volume mount) |

Note: `SEC-005` is context-aware — it activates only when a secrets operator (Doppler, External Secrets, etc.) is detected in the cluster, and applies only to `type: Opaque` secrets that have no `ownerReferences` and are not the managed output of a detected operator. Without a secrets operator present, the rule is suppressed entirely.

### 6.4 Rule Catalog — Networking & Storage

| ID | Severity | Rule |
|---|---|---|
| `NET-001` | warn | Service of type LoadBalancer in a namespace with no NetworkPolicy |
| `NET-002` | info | Ingress has no TLS configured |
| `NET-003` | warn | Ingress references a missing Service |
| `STO-001` | warn | PVC is unbound (Pending phase) |
| `STO-002` | info | PVC uses default StorageClass — consider explicit class |
| `STO-003` | warn | PV reclaim policy is Delete with no backup annotation |

### 6.5 Rule Catalog — Kafka

Applies to both Strimzi-managed and bare KRaft Kafka, detected via:
- Strimzi: `kafka.strimzi.io` CRD presence
- Bare Kafka: pods/statefulsets with labels `app=kafka` or `app.kubernetes.io/name=kafka`

| ID | Severity | Rule |
|---|---|---|
| `KFK-001` | error | Topic has replication factor of 1 (no fault tolerance) |
| `KFK-002` | warn | Topic has replication factor less than 3 |
| `KFK-003` | error | Topic has min.insync.replicas equal to replication factor (no tolerance for broker loss) |
| `KFK-004` | warn | Consumer group lag is in critical threshold and trending upward |
| `KFK-005` | warn | Topic has no retention policy set (unlimited retention) |
| `KFK-006` | error | Under-replicated partitions detected (from Prometheus metrics) |
| `KFK-007` | warn | Broker count is 1 (single point of failure) |
| `KFK-008` | warn | KafkaUser has wildcard ACL (`*`) on resource type Topic (Strimzi only) |
| `KFK-009` | info | Topic has no consumer groups (possibly orphaned) |
| `KFK-010` | warn | KRaft cluster running without persistent storage (emptyDir volumes) |
| `KFK-011` | error | Strimzi operator pod not running (CRDs present but operator absent) |
| `KFK-012` | warn | Kafka version is more than 2 minor versions behind latest known (from Strimzi spec) |
| `KFK-013` | info | Kafka detected but no lag metrics exported — consumer lag monitoring unavailable (see §2.2.1) |

**Rule applicability by Kafka deployment type:**

| Source required | Rules | Strimzi | Bare Kafka |
|---|---|---|---|
| Strimzi CRDs | 003, 005, 008, 012 | ✓ | — |
| kafka-exporter metrics (`kafka_topic_partition_replicas`, `kafka_consumergroup_lag`) | 001, 002, 004, 009 | ✓ if exporter | ✓ if exporter |
| JMX/Prometheus broker metrics | 006 | ✓ if metrics | ✓ if metrics |
| Pod/StatefulSet inspection | 007, 010, 011 | ✓ | ✓ |

Bare clusters without kafka-exporter get only the pod-inspection rules plus the KFK-013 prompt.

### 6.6 Rule Catalog — Observability

| ID | Severity | Rule |
|---|---|---|
| `OBS-010` | info | No Prometheus found in cluster |
| `OBS-011` | info | No ServiceMonitors defined (Prometheus present but nothing monitored) |
| `OBS-012` | warn | Pod has no resource labels for Prometheus scraping (`prometheus.io/scrape`) |

### 6.7 Rule suppression

Rules can be suppressed per resource via annotation:

```yaml
annotations:
  p9r.io/suppress-rules: "RES-001,REL-001"
```

Suppressed rules show as `○ suppressed` in the dashboard with the annotation as the reason. This avoids false positives for intentional configurations (e.g. a single-replica dev deployment).

---

## 7. Kafka Detection

### 7.1 Strimzi detection

- Check for `kafka.strimzi.io` API group via discovery API
- If present: use Strimzi CRD resources as the source of truth for cluster topology

### 7.2 Bare Kafka detection

Checked when Strimzi is absent:

1. StatefulSets with labels matching:
   - `app=kafka`
   - `app.kubernetes.io/name=kafka`
   - `app.kubernetes.io/component=kafka`
2. Pods with the same label patterns
3. Services exposing port 9092 (Kafka broker port)

If detected: surface under Custom Resources → Kafka (bare) in the sidebar with a generic resource view. Health rules `KFK-001` through `KFK-010` still apply via Prometheus metrics (replication and lag) and pod inspection (volumes, replicas).

### 7.3 KRaft vs ZooKeeper detection

- KRaft: no ZooKeeper pods/services present, Kafka version >= 3.3
- ZooKeeper mode: ZooKeeper pods/services present with labels `app=zookeeper` or `app.kubernetes.io/name=zookeeper`
- Rule `KFK-010` (emptyDir volumes) applies to both

---

## 8. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | Metrics polling interval when tab active | 10s when MetricsTab focused, 30s background |
| OQ-2 | Chart type for TUI | Sparklines in list view, ASCII time-series in MetricsTab |
| OQ-3 | Time ranges | 20m, 1h, 4h, 1d, 2d |
| OQ-4 | Kafka metrics focus | Lag shape over time is primary signal; spike-and-recovery vs plateau |
| OQ-5 | Metrics-server fallback | Current values only, no charts, prompt to install Prometheus |
| OQ-6 | Best practices generation | Rule-based (deterministic), not LLM-generated |
| OQ-7 | Health dashboard placement | Root of left sidebar tree, default launch view |
| OQ-8 | Bare Kafka support | Detected via pod/statefulset labels and port 9092; same health rules applied |
| OQ-9 | Rule suppression | Via `p9r.io/suppress-rules` annotation on the resource |
| OQ-10 | Exporter availability | Per-metric-family probing; charts degrade individually; Kafka Exporter empty-state prompt |
| OQ-11 | metrics-server sparklines | Session-buffer sparklines (40 samples) labeled as session data |

---

*Next: Spec 07 — Agent*
