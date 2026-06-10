# Privateer — Resource Model Spec
**Spec:** 03-resource-model  
**Status:** Draft  
**Depends on:** Spec 01 (Architecture), Spec 02 (Navigation & Layout)

---

## 1. Goals

- Define all resource types Privateer understands in v1
- Define the column schema for each resource type's list view
- Define status rollup rules for each resource type
- Define CRD awareness: generic fallback + curated first-party CRDs
- Establish the ResourceObject internal type

---

## 2. Internal ResourceObject Type

All resources in the State Store are normalized to a common wrapper:

```typescript
interface ResourceObject {
  // Identity
  uid: string;
  kind: string;
  apiVersion: string;
  name: string;
  namespace: string | null;       // null for cluster-scoped resources
  
  // Metadata
  labels: Record<string, string>;
  annotations: Record<string, string>;
  creationTimestamp: string;      // ISO 8601
  resourceVersion: string;
  
  // Status
  status: ResourceStatus;
  
  // Raw object from k8s API (full body, for YAML view and detail rendering)
  raw: KubernetesObject;
}

type StatusColor = 'green' | 'yellow' | 'red' | 'grey';

interface ResourceStatus {
  color: StatusColor;
  label: string;                  // human-readable, e.g. "Running", "CrashLoopBackOff"
  ready?: string;                 // e.g. "3/3" for deployments
  message?: string;               // error message if applicable
}
```

Status is computed from the raw object by a **status resolver** — a pure function per resource kind. See §4.

---

## 3. Built-in Resource Types

### 3.1 Workloads

#### Deployments
| Column | Source | Width |
|---|---|---|
| Status | `.status.conditions` | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Ready | `readyReplicas/replicas` | 8 |
| Up-to-date | `.status.updatedReplicas` | 10 |
| Available | `.status.availableReplicas` | 10 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: `availableReplicas == replicas && replicas > 0`
- yellow: `availableReplicas < replicas && availableReplicas > 0` or progressing condition true
- red: `availableReplicas == 0` or ReplicaFailure condition true
- grey: `replicas == 0` (scaled to zero)

#### StatefulSets
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Ready | `readyReplicas/replicas` | 8 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: `readyReplicas == replicas && replicas > 0`
- yellow: `readyReplicas < replicas && readyReplicas > 0`
- red: `readyReplicas == 0 && replicas > 0`
- grey: `replicas == 0`

#### DaemonSets
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Desired | `.status.desiredNumberScheduled` | 8 |
| Ready | `.status.numberReady` | 8 |
| Up-to-date | `.status.updatedNumberScheduled` | 10 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: `numberReady == desiredNumberScheduled`
- yellow: `numberReady < desiredNumberScheduled && numberReady > 0`
- red: `numberReady == 0 && desiredNumberScheduled > 0`
- grey: `desiredNumberScheduled == 0`

#### ReplicaSets
Same columns and status logic as Deployments. Owned ReplicaSets (those with an ownerReference to a Deployment) are shown but visually de-emphasized.

#### Pods
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Ready | `readyContainers/totalContainers` | 8 |
| Phase | `.status.phase` | 12 |
| Restarts | sum of `.status.containerStatuses[].restartCount` | 8 |
| Node | `.spec.nodeName` | 15% |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: phase=Running, all containers ready, restarts < 5
- yellow: phase=Pending, or phase=Running with restarts >= 5
- red: phase=Failed, or any container in CrashLoopBackOff / OOMKilled / Error
- grey: phase=Succeeded (completed) or phase=Unknown or Terminating

#### Jobs
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Completions | `succeeded/completions` | 12 |
| Duration | `completionTime - startTime` | 10 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: Complete condition true
- yellow: Active > 0 (running)
- red: Failed condition true
- grey: no conditions yet

#### CronJobs
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Schedule | `.spec.schedule` | 15 |
| Suspend | `.spec.suspend` | 8 |
| Last Schedule | `.status.lastScheduleTime` | 15 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: not suspended, lastScheduleTime recent
- yellow: suspended
- red: last job failed
- grey: never scheduled

---

### 3.2 Networking

#### Services
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Type | `.spec.type` | 12 |
| Cluster IP | `.spec.clusterIP` | 15 |
| External IP | `.status.loadBalancer.ingress[0].ip` | 15 |
| Ports | `.spec.ports[].port/protocol` | 15% |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: ClusterIP or NodePort (always reachable within cluster)
- green: LoadBalancer with external IP assigned
- yellow: LoadBalancer pending external IP
- grey: ExternalName or headless

#### Ingresses
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Class | `.spec.ingressClassName` | 12 |
| Hosts | `.spec.rules[].host` joined | 25% |
| Address | `.status.loadBalancer.ingress[0]` | 15 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: address assigned
- yellow: no address yet
- grey: no rules defined

#### NetworkPolicies
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 35% |
| Namespace | `.metadata.namespace` | 20% |
| Pod Selector | `.spec.podSelector` rendered | 25% |
| Age | `.metadata.creationTimestamp` | 10 |

No status color — NetworkPolicies are always grey (existence is the signal, not health).

---

### 3.3 Configuration

#### ConfigMaps
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 35% |
| Namespace | `.metadata.namespace` | 20% |
| Keys | count of `.data` keys | 8 |
| Age | `.metadata.creationTimestamp` | 10 |

#### Secrets
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 35% |
| Namespace | `.metadata.namespace` | 20% |
| Type | `.type` | 20 |
| Keys | count of `.data` keys | 8 |
| Age | `.metadata.creationTimestamp` | 10 |

**Note:** Secret values are never displayed in plaintext in any view. Keys are shown, values are redacted as `[redacted]` in YAML view by default. A toggle to reveal is available per-resource with a confirmation prompt.

#### HorizontalPodAutoscalers
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 25% |
| Namespace | `.metadata.namespace` | 15% |
| Reference | `.spec.scaleTargetRef.name` | 20% |
| Min/Max | `minReplicas/maxReplicas` | 10 |
| Replicas | `.status.currentReplicas` | 10 |
| CPU% | current/target CPU utilization | 12 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: currentReplicas within min/max, no conditions warning
- yellow: at max replicas (scaling pressure)
- red: ScalingLimited or AbleToScale=false condition

---

### 3.4 Storage

#### PersistentVolumeClaims
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Phase | `.status.phase` | 10 |
| Volume | `.spec.volumeName` | 20% |
| Capacity | `.status.capacity.storage` | 10 |
| Storage Class | `.spec.storageClassName` | 15% |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: phase=Bound
- yellow: phase=Pending
- red: phase=Lost
- grey: phase=Released

#### PersistentVolumes
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 25% |
| Capacity | `.spec.capacity.storage` | 10 |
| Access Modes | `.spec.accessModes` joined | 15 |
| Reclaim Policy | `.spec.persistentVolumeReclaimPolicy` | 12 |
| Phase | `.status.phase` | 10 |
| Claim | `.spec.claimRef.namespace/name` | 20% |
| Storage Class | `.spec.storageClassName` | 15% |
| Age | `.metadata.creationTimestamp` | 10 |

#### StorageClasses
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 35% |
| Provisioner | `.provisioner` | 25% |
| Reclaim Policy | `.reclaimPolicy` | 15 |
| Default | `storageclass.kubernetes.io/is-default-class` annotation | 8 |
| Age | `.metadata.creationTimestamp` | 10 |

---

### 3.5 Access Control

#### ServiceAccounts
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 35% |
| Namespace | `.metadata.namespace` | 20% |
| Secrets | count of `.secrets` | 8 |
| Age | `.metadata.creationTimestamp` | 10 |

#### Roles / ClusterRoles
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 40% |
| Namespace | `.metadata.namespace` | 20% (Roles only) |
| Rules | count of `.rules` | 8 |
| Age | `.metadata.creationTimestamp` | 10 |

#### RoleBindings / ClusterRoleBindings
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% (RoleBindings only) |
| Role | `.roleRef.name` | 25% |
| Subjects | count + first subject name | 20% |
| Age | `.metadata.creationTimestamp` | 10 |

---

### 3.6 Nodes

#### Nodes
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 25% |
| Role | `node-role.kubernetes.io/*` labels | 12 |
| Version | `.status.nodeInfo.kubeletVersion` | 12 |
| CPU | allocatable vs requested (if metrics available) | 10 |
| Memory | allocatable vs requested (if metrics available) | 10 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: Ready condition true, no pressure conditions
- yellow: MemoryPressure or DiskPressure or PIDPressure condition true
- red: Ready condition false or Unknown
- grey: node cordoned (`spec.unschedulable: true`)

---

### 3.7 Namespaces

#### Namespaces
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 40% |
| Phase | `.status.phase` | 10 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: phase=Active
- red: phase=Terminating
- grey: unknown

---

## 4. Status Resolver Architecture

Each resource kind has a registered status resolver:

```typescript
type StatusResolver = (raw: KubernetesObject) => ResourceStatus;

const statusResolvers: Map<string, StatusResolver> = new Map([
  ['Deployment', resolveDeploymentStatus],
  ['Pod', resolvePodStatus],
  // ...
]);

function resolveStatus(kind: string, raw: KubernetesObject): ResourceStatus {
  const resolver = statusResolvers.get(kind) ?? resolveGenericStatus;
  return resolver(raw);
}
```

`resolveGenericStatus` checks for a `.status.conditions` array and looks for a `Ready` or `Available` condition. Falls back to grey/Unknown if none found.

---

## 5. CRD Resource Types

### 5.1 Generic CRD Fallback

For any CRD not in the curated list, Privateer renders:

**List columns:**
| Column | Source |
|---|---|
| Status | `resolveGenericStatus` |
| Name | `.metadata.name` |
| Namespace | `.metadata.namespace` |
| Age | `.metadata.creationTimestamp` |

**Detail:** Raw YAML only (no Overview tab structure).

### 5.2 Strimzi (Kafka Operator)

CRDs discovered via `kafka.strimzi.io` API group.

#### Kafka (clusters)
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 25% |
| Namespace | `.metadata.namespace` | 15% |
| Version | `.spec.kafka.version` | 10 |
| Brokers | `.spec.kafka.replicas` | 8 |
| Zookeeper | `.spec.zookeeper.replicas` | 10 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: `Ready` condition in `.status.conditions` is True
- yellow: any condition with status Unknown
- red: `NotReady` condition, or Ready=False with reason
- grey: no conditions

**Detail tabs:** Overview, YAML, Events, Metrics (broker count, under-replicated partitions, controller)

#### KafkaTopic
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Partitions | `.spec.partitions` | 10 |
| Replication | `.spec.replicas` | 12 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:** Same conditions pattern as Kafka cluster.

**Detail tabs:**
- **Overview** — partitions, replication factor, retention bytes/ms, cleanup policy
- **Consumer Groups** — list of consumer groups consuming this topic; per-group lag sourced from Prometheus (`kafka_consumergroup_lag` metric); shown as table: group name, total lag, status; per-partition lag is an expandable row (Enter/click on a group)
- **Config** — full topic config as YAML
- **Messages** → v2

**Consumer group lag display:**
```
Consumer Groups
───────────────────────────────────────────────
Group                    Total Lag   Status
order-service            0           ● healthy
payment-service          1,204       ● warning
analytics-pipeline       48,291      ● critical
───────────────────────────────────────────────
```
Lag thresholds (configurable in `~/.config/p9r/config.yaml`):
- healthy: lag == 0
- warning: lag > 0 and < 10,000
- critical: lag >= 10,000

#### KafkaUser
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Authentication | `.spec.authentication.type` | 15 |
| Authorization | `.spec.authorization.type` | 15 |
| Age | `.metadata.creationTimestamp` | 10 |

#### KafkaConnect
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 25% |
| Namespace | `.metadata.namespace` | 15% |
| Replicas | `.spec.replicas` | 8 |
| Bootstrap Servers | `.spec.bootstrapServers` | 25% |
| Age | `.metadata.creationTimestamp` | 10 |

#### KafkaBridge
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 25% |
| Namespace | `.metadata.namespace` | 15% |
| Replicas | `.spec.replicas` | 8 |
| Bootstrap Servers | `.spec.bootstrapServers` | 25% |
| Age | `.metadata.creationTimestamp` | 10 |

---

### 5.3 Doppler Operator

CRDs discovered via `doppler.com` API group.

#### DopplerSecret
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Project | `.spec.project` | 15% |
| Config | `.spec.config` | 15% |
| Secret Name | `.spec.secretName` | 15% |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:**
- green: `secrets.doppler.com/secretsGenerated` condition True, or `ConditionReady` True
- yellow: condition status Unknown
- red: condition False (sync failed)
- grey: no conditions

**Detail tabs:** Overview (project, config, managed secret ref), YAML, Events

**Note:** Secret values themselves are managed by the Doppler operator and stored in a referenced k8s Secret. Privateer shows the DopplerSecret config, not the secret values. The referenced k8s Secret is shown as a link in the Overview tab.

---

### 5.4 Prometheus Operator

CRDs discovered via `monitoring.coreos.com` API group.

#### PrometheusRule
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 35% |
| Namespace | `.metadata.namespace` | 20% |
| Groups | count of `.spec.groups` | 8 |
| Rules | total count of rules across groups | 8 |
| Age | `.metadata.creationTimestamp` | 10 |

No status color — PrometheusRules are configuration, not runtime state.

#### ServiceMonitor
| Column | Source | Width |
|---|---|---|
| Name | `.metadata.name` | 35% |
| Namespace | `.metadata.namespace` | 20% |
| Endpoints | count of `.spec.endpoints` | 10 |
| Selector | `.spec.selector.matchLabels` rendered | 25% |
| Age | `.metadata.creationTimestamp` | 10 |

#### PodMonitor
Same columns as ServiceMonitor, using `.spec.podMetricsEndpoints`.

#### Alertmanager
| Column | Source | Width |
|---|---|---|
| Status | computed | 2 |
| Name | `.metadata.name` | 30% |
| Namespace | `.metadata.namespace` | 15% |
| Replicas | `.spec.replicas` | 8 |
| Version | `.spec.version` | 10 |
| Age | `.metadata.creationTimestamp` | 10 |

**Status resolver:** Same Ready condition pattern as Strimzi.

---

## 6. Age Formatting

All age columns use human-readable relative format:

| Duration | Display |
|---|---|
| < 60s | `42s` |
| < 60m | `14m` |
| < 24h | `6h` |
| < 30d | `12d` |
| >= 30d | `3mo` |
| >= 365d | `2y` |

---

## 7. Sidebar CRD Grouping

CRDs are grouped in the sidebar under **Custom Resources** by their API group:

```
▼ Custom Resources
  ▼ kafka.strimzi.io
      Kafkas
      KafkaTopics
      KafkaUsers
      KafkaConnects
      KafkaBridges
  ▼ doppler.com
      DopplerSecrets
  ▼ monitoring.coreos.com
      PrometheusRules
      ServiceMonitors
      PodMonitors
      Alertmanagers
  ▼ other.group.io         ← generic fallback groups
      SomeResource
```

CRD groups are discovered at startup and re-discovered on context switch.

---

## 8. Out of Scope for This Spec

- Column rendering details and YAML syntax highlighting → Spec 04 (Core Views)
- Log streaming, exec, port-forward → Spec 05 (Actions)
- Prometheus metric queries per resource type → Spec 06 (Metrics)
- Kafka message viewing → v2
- Agent prompt context serialization of resources → Spec 07 (Agent)

---

## 9. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | CRD rendering strategy | Generic fallback + curated first-party CRDs |
| OQ-2 | Curated CRD list for v1 | Strimzi, Doppler, Prometheus Operator |
| OQ-3 | Kafka consumer lag | Surfaced via Prometheus in KafkaTopic detail — Consumer Groups tab |
| OQ-4 | Kafka message viewing | v2 |
| OQ-5 | Secret value display | Redacted by default, reveal toggle with confirmation |

---

*Next: Spec 04 — Core Views*
