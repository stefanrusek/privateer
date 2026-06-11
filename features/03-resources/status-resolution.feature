Feature: Resource status resolution
  As an operator using Privateer
  I want each Kubernetes resource to show an accurate status color and label
  So that I can quickly identify healthy, degraded, and failed resources

  # ---------------------------------------------------------------------------
  # Deployments (Spec 03 §3.1)
  # ---------------------------------------------------------------------------
  Scenario Outline: Deployment status resolution
    Given a raw Kubernetes object of kind "Deployment" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                                                                               | color  | label       |
      | {"replicas":3,"availableReplicas":3,"updatedReplicas":3}                                           | green  | Available   |
      | {"replicas":3,"availableReplicas":2,"updatedReplicas":3}                                           | yellow | Degraded    |
      | {"replicas":3,"availableReplicas":1,"updatedReplicas":3}                                           | yellow | Degraded    |
      | {"replicas":3,"availableReplicas":0,"updatedReplicas":3}                                           | red    | Unavailable |
      | {"replicas":0}                                                                                     | grey   | Scaled Down |
      | {"replicas":3,"availableReplicas":3,"conditions":[{"type":"Progressing","status":"True"}]}         | green  | Available   |
      | {"replicas":3,"availableReplicas":2,"conditions":[{"type":"Progressing","status":"True"}]}         | yellow | Progressing |
      | {"replicas":3,"availableReplicas":0,"conditions":[{"type":"ReplicaFailure","status":"True"}]}      | red    | ReplicaFailure |

  # ---------------------------------------------------------------------------
  # StatefulSets (Spec 03 §3.1)
  # ---------------------------------------------------------------------------
  Scenario Outline: StatefulSet status resolution
    Given a raw Kubernetes object of kind "StatefulSet" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                         | color  | label       |
      | {"replicas":3,"readyReplicas":3}             | green  | Ready       |
      | {"replicas":3,"readyReplicas":2}             | yellow | Degraded    |
      | {"replicas":3,"readyReplicas":0}             | red    | Unavailable |
      | {"replicas":0}                               | grey   | Scaled Down |
      | {"replicas":3,"readyReplicas":1}             | yellow | Degraded    |

  # ---------------------------------------------------------------------------
  # DaemonSets (Spec 03 §3.1)
  # ---------------------------------------------------------------------------
  Scenario Outline: DaemonSet status resolution
    Given a raw Kubernetes object of kind "DaemonSet" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                                                | color  | label       |
      | {"desiredNumberScheduled":3,"numberReady":3}                        | green  | Ready       |
      | {"desiredNumberScheduled":3,"numberReady":2}                        | yellow | Degraded    |
      | {"desiredNumberScheduled":3,"numberReady":1}                        | yellow | Degraded    |
      | {"desiredNumberScheduled":3,"numberReady":0}                        | red    | Unavailable |
      | {"desiredNumberScheduled":0,"numberReady":0}                        | grey   | No Nodes    |

  # ---------------------------------------------------------------------------
  # Pods (Spec 03 §3.1)
  # ---------------------------------------------------------------------------
  Scenario Outline: Pod status resolution
    Given a raw Kubernetes object of kind "Pod" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                                                                                          | color  | label              |
      | {"phase":"Running","containerStatuses":[{"ready":true,"restartCount":0}]}                                     | green  | Running            |
      | {"phase":"Running","containerStatuses":[{"ready":true,"restartCount":4}]}                                     | green  | Running            |
      | {"phase":"Running","containerStatuses":[{"ready":true,"restartCount":5}]}                                     | yellow | High Restarts      |
      | {"phase":"Pending"}                                                                                           | yellow | Pending            |
      | {"phase":"Failed"}                                                                                            | red    | Failed             |
      | {"phase":"Succeeded"}                                                                                         | grey   | Succeeded          |
      | {"phase":"Unknown"}                                                                                           | grey   | Unknown            |
      | {"phase":"Running","containerStatuses":[{"ready":false,"restartCount":0,"state":{"waiting":{"reason":"CrashLoopBackOff"}}}]} | red | CrashLoopBackOff |
      | {"phase":"Running","containerStatuses":[{"ready":false,"restartCount":0,"state":{"terminated":{"reason":"OOMKilled"}}}]}    | red | OOMKilled         |
      | {"phase":"Running","containerStatuses":[{"ready":false,"restartCount":0,"state":{"terminated":{"reason":"Error"}}}]}        | red | Error             |

  # ---------------------------------------------------------------------------
  # Jobs (Spec 03 §3.1)
  # ---------------------------------------------------------------------------
  Scenario Outline: Job status resolution
    Given a raw Kubernetes object of kind "Job" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                                                               | color  | label     |
      | {"conditions":[{"type":"Complete","status":"True"}]}                               | green  | Complete  |
      | {"active":1}                                                                       | yellow | Running   |
      | {"conditions":[{"type":"Failed","status":"True"}]}                                 | red    | Failed    |
      | {}                                                                                 | grey   | Pending   |

  # ---------------------------------------------------------------------------
  # CronJobs (Spec 03 §3.1)
  # ---------------------------------------------------------------------------
  Scenario Outline: CronJob status resolution
    Given a raw Kubernetes object of kind "CronJob" with spec data <spec> and status data <status>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | spec                               | status                                        | color  | label     |
      | {"suspend":false}                  | {"lastScheduleTime":"2024-01-01T00:00:00Z"}   | green  | Active    |
      | {"suspend":true}                   | {"lastScheduleTime":"2024-01-01T00:00:00Z"}   | yellow | Suspended |
      | {"suspend":false}                  | {}                                            | grey   | Never Run |
      | {}                                 | {}                                            | grey   | Never Run |

  # ---------------------------------------------------------------------------
  # Services (Spec 03 §3.2)
  # ---------------------------------------------------------------------------
  Scenario Outline: Service status resolution
    Given a raw Kubernetes object of kind "Service" with spec data <spec> and status data <status>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | spec                                           | status                                                   | color  | label    |
      | {"type":"ClusterIP"}                           | {}                                                       | green  | ClusterIP |
      | {"type":"NodePort"}                            | {}                                                       | green  | NodePort |
      | {"type":"LoadBalancer"}                        | {"loadBalancer":{"ingress":[{"ip":"1.2.3.4"}]}}          | green  | Assigned |
      | {"type":"LoadBalancer"}                        | {"loadBalancer":{"ingress":[]}}                          | yellow | Pending  |
      | {"type":"LoadBalancer"}                        | {}                                                       | yellow | Pending  |
      | {"type":"ExternalName"}                        | {}                                                       | grey   | External |
      | {"type":"ClusterIP","clusterIP":"None"}        | {}                                                       | grey   | Headless |

  # ---------------------------------------------------------------------------
  # Ingresses (Spec 03 §3.2)
  # ---------------------------------------------------------------------------
  Scenario Outline: Ingress status resolution
    Given a raw Kubernetes object of kind "Ingress" with spec data <spec> and status data <status>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | spec                              | status                                                  | color  | label    |
      | {"rules":[{"host":"x.com"}]}      | {"loadBalancer":{"ingress":[{"ip":"1.2.3.4"}]}}         | green  | Assigned |
      | {"rules":[{"host":"x.com"}]}      | {}                                                      | yellow | Pending  |
      | {}                                | {}                                                      | grey   | No Rules |

  # ---------------------------------------------------------------------------
  # NetworkPolicies (Spec 03 §3.2)
  # ---------------------------------------------------------------------------
  Scenario: NetworkPolicy is always grey
    Given a raw Kubernetes object of kind "NetworkPolicy" with status data {}
    When I resolve its status
    Then the status color is "grey" and label is "NetworkPolicy"

  # ---------------------------------------------------------------------------
  # HPA (Spec 03 §3.3)
  # ---------------------------------------------------------------------------
  Scenario Outline: HorizontalPodAutoscaler status resolution
    Given a raw Kubernetes object of kind "HorizontalPodAutoscaler" with spec data <spec> and status data <status>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | spec                               | status                                                                                | color  | label          |
      | {"minReplicas":1,"maxReplicas":5}  | {"currentReplicas":3}                                                                 | green  | OK             |
      | {"minReplicas":1,"maxReplicas":5}  | {"currentReplicas":5}                                                                 | yellow | At Maximum     |
      | {"minReplicas":1,"maxReplicas":5}  | {"currentReplicas":3,"conditions":[{"type":"ScalingLimited","status":"True"}]}        | red    | ScalingLimited |
      | {"minReplicas":1,"maxReplicas":5}  | {"currentReplicas":3,"conditions":[{"type":"AbleToScale","status":"False"}]}          | red    | AbleToScale    |

  # ---------------------------------------------------------------------------
  # PVC (Spec 03 §3.4)
  # ---------------------------------------------------------------------------
  Scenario Outline: PersistentVolumeClaim status resolution
    Given a raw Kubernetes object of kind "PersistentVolumeClaim" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                     | color  | label    |
      | {"phase":"Bound"}        | green  | Bound    |
      | {"phase":"Pending"}      | yellow | Pending  |
      | {"phase":"Lost"}         | red    | Lost     |
      | {"phase":"Released"}     | grey   | Released |
      | {}                       | grey   | Unknown  |

  # ---------------------------------------------------------------------------
  # PV (Spec 03 §3.4)
  # ---------------------------------------------------------------------------
  Scenario Outline: PersistentVolume status resolution
    Given a raw Kubernetes object of kind "PersistentVolume" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                        | color  | label     |
      | {"phase":"Bound"}           | green  | Bound     |
      | {"phase":"Available"}       | green  | Available |
      | {"phase":"Pending"}         | yellow | Pending   |
      | {"phase":"Released"}        | yellow | Released  |
      | {"phase":"Failed"}          | red    | Failed    |
      | {}                          | grey   | Unknown   |

  # ---------------------------------------------------------------------------
  # Nodes (Spec 03 §3.6)
  # ---------------------------------------------------------------------------
  Scenario Outline: Node status resolution
    Given a raw Kubernetes object of kind "Node" with spec data <spec> and status data <status>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | spec                      | status                                                                              | color  | label    |
      | {}                        | {"conditions":[{"type":"Ready","status":"True"}]}                                   | green  | Ready    |
      | {}                        | {"conditions":[{"type":"Ready","status":"True"},{"type":"MemoryPressure","status":"True"}]} | yellow | MemoryPressure |
      | {}                        | {"conditions":[{"type":"Ready","status":"True"},{"type":"DiskPressure","status":"True"}]}   | yellow | DiskPressure   |
      | {}                        | {"conditions":[{"type":"Ready","status":"True"},{"type":"PIDPressure","status":"True"}]}    | yellow | PIDPressure    |
      | {}                        | {"conditions":[{"type":"Ready","status":"False"}]}                                  | red    | NotReady |
      | {}                        | {"conditions":[{"type":"Ready","status":"Unknown"}]}                                | red    | NotReady |
      | {}                        | {"conditions":[]}                                                                   | red    | NotReady |
      | {"unschedulable":true}    | {"conditions":[{"type":"Ready","status":"True"}]}                                   | grey   | Cordoned |

  # ---------------------------------------------------------------------------
  # Namespaces (Spec 03 §3.7)
  # ---------------------------------------------------------------------------
  Scenario Outline: Namespace status resolution
    Given a raw Kubernetes object of kind "Namespace" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                        | color  | label       |
      | {"phase":"Active"}          | green  | Active      |
      | {"phase":"Terminating"}     | red    | Terminating |
      | {}                          | grey   | Unknown     |

  # ---------------------------------------------------------------------------
  # Strimzi (Spec 03 §5.2)
  # ---------------------------------------------------------------------------
  Scenario Outline: Strimzi Kafka resource status resolution
    Given a raw Kubernetes object of kind "<kind>" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | kind         | data                                                                     | color  | label    |
      | Kafka        | {"conditions":[{"type":"Ready","status":"True"}]}                        | green  | Ready    |
      | Kafka        | {"conditions":[{"type":"Ready","status":"Unknown"}]}                     | yellow | Unknown  |
      | Kafka        | {"conditions":[{"type":"Ready","status":"False","reason":"Error"}]}      | red    | NotReady |
      | Kafka        | {"conditions":[{"type":"NotReady","status":"True"}]}                     | red    | NotReady |
      | Kafka        | {}                                                                       | grey   | No Conditions |
      | KafkaTopic   | {"conditions":[{"type":"Ready","status":"True"}]}                        | green  | Ready    |
      | KafkaTopic   | {"conditions":[{"type":"Ready","status":"Unknown"}]}                     | yellow | Unknown  |
      | KafkaTopic   | {"conditions":[{"type":"Ready","status":"False","reason":"Error"}]}      | red    | NotReady |
      | KafkaTopic   | {}                                                                       | grey   | No Conditions |
      | KafkaUser    | {"conditions":[{"type":"Ready","status":"True"}]}                        | green  | Ready    |
      | KafkaUser    | {"conditions":[{"type":"Ready","status":"False"}]}                       | red    | NotReady |
      | KafkaUser    | {}                                                                       | grey   | No Conditions |
      | KafkaConnect | {"conditions":[{"type":"Ready","status":"True"}]}                        | green  | Ready    |
      | KafkaConnect | {"conditions":[{"type":"Ready","status":"False"}]}                       | red    | NotReady |
      | KafkaConnect | {}                                                                       | grey   | No Conditions |
      | KafkaBridge  | {"conditions":[{"type":"Ready","status":"True"}]}                        | green  | Ready    |
      | KafkaBridge  | {"conditions":[{"type":"Ready","status":"False"}]}                       | red    | NotReady |
      | KafkaBridge  | {}                                                                       | grey   | No Conditions |

  # ---------------------------------------------------------------------------
  # Doppler (Spec 03 §5.3)
  # ---------------------------------------------------------------------------
  Scenario Outline: DopplerSecret status resolution
    Given a raw Kubernetes object of kind "DopplerSecret" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                                                                              | color  | label    |
      | {"conditions":[{"type":"secrets.doppler.com/secretsGenerated","status":"True"}]}                 | green  | Synced   |
      | {"conditions":[{"type":"ConditionReady","status":"True"}]}                                       | green  | Synced   |
      | {"conditions":[{"type":"ConditionReady","status":"Unknown"}]}                                    | yellow | Unknown  |
      | {"conditions":[{"type":"ConditionReady","status":"False"}]}                                      | red    | Failed   |
      | {}                                                                                               | grey   | No Conditions |

  # ---------------------------------------------------------------------------
  # Alertmanager (Spec 03 §5.4)
  # ---------------------------------------------------------------------------
  Scenario Outline: Alertmanager status resolution
    Given a raw Kubernetes object of kind "Alertmanager" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                                               | color  | label    |
      | {"conditions":[{"type":"Ready","status":"True"}]}                  | green  | Ready    |
      | {"conditions":[{"type":"Ready","status":"Unknown"}]}               | yellow | Unknown  |
      | {"conditions":[{"type":"Ready","status":"False"}]}                 | red    | NotReady |
      | {}                                                                 | grey   | No Conditions |

  # ---------------------------------------------------------------------------
  # Generic fallback (Spec 03 §4, §5.1)
  # ---------------------------------------------------------------------------
  Scenario Outline: Generic status fallback
    Given a raw Kubernetes object of kind "SomeCustomResource" with status data <data>
    When I resolve its status
    Then the status color is "<color>" and label is "<label>"

    Examples:
      | data                                                                        | color  | label   |
      | {"conditions":[{"type":"Ready","status":"True"}]}                           | green  | Ready   |
      | {"conditions":[{"type":"Available","status":"True"}]}                       | green  | Available |
      | {"conditions":[{"type":"Ready","status":"False"}]}                          | red    | Ready   |
      | {"conditions":[{"type":"Ready","status":"Unknown"}]}                        | grey   | Unknown |
      | {}                                                                          | grey   | Unknown |
