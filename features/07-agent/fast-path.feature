Feature: Fast-path deterministic intent parser
  As a user of Privateer
  I want common navigation intents to resolve instantly
  So that I can navigate without waiting for the LLM

  Background:
    Given the fast-path parser is initialized

  # ---------------------------------------------------------------------------
  # Navigate patterns — "show|go to|open <alias>"
  # ---------------------------------------------------------------------------

  Scenario: "show pods" navigates to Pod
    When I parse "show pods"
    Then the fast-path action is navigate to "Pod"

  Scenario: "show pod" (singular) navigates to Pod
    When I parse "show pod"
    Then the fast-path action is navigate to "Pod"

  Scenario: "go to deployments" navigates to Deployment
    When I parse "go to deployments"
    Then the fast-path action is navigate to "Deployment"

  Scenario: "go to deploy" (alias) navigates to Deployment
    When I parse "go to deploy"
    Then the fast-path action is navigate to "Deployment"

  Scenario: "open services" navigates to Service
    When I parse "open services"
    Then the fast-path action is navigate to "Service"

  Scenario: "open svc" (alias) navigates to Service
    When I parse "open svc"
    Then the fast-path action is navigate to "Service"

  Scenario: "show sts" navigates to StatefulSet
    When I parse "show sts"
    Then the fast-path action is navigate to "StatefulSet"

  Scenario: "show ds" navigates to DaemonSet
    When I parse "show ds"
    Then the fast-path action is navigate to "DaemonSet"

  Scenario: "show cm" navigates to ConfigMap
    When I parse "show cm"
    Then the fast-path action is navigate to "ConfigMap"

  Scenario: "show pvc" navigates to PersistentVolumeClaim
    When I parse "show pvc"
    Then the fast-path action is navigate to "PersistentVolumeClaim"

  Scenario: "show ing" navigates to Ingress
    When I parse "show ing"
    Then the fast-path action is navigate to "Ingress"

  Scenario: "show topics" navigates to KafkaTopic
    When I parse "show topics"
    Then the fast-path action is navigate to "KafkaTopic"

  # Case-insensitive matching
  Scenario: "SHOW PODS" (uppercase) navigates to Pod
    When I parse "SHOW PODS"
    Then the fast-path action is navigate to "Pod"

  Scenario: "Go To Deploy" (mixed case) navigates to Deployment
    When I parse "Go To Deploy"
    Then the fast-path action is navigate to "Deployment"

  # ---------------------------------------------------------------------------
  # Bare alias navigation
  # ---------------------------------------------------------------------------

  Scenario: Bare "pods" navigates to Pod
    When I parse "pods"
    Then the fast-path action is navigate to "Pod"

  Scenario: Bare "deployments" navigates to Deployment
    When I parse "deployments"
    Then the fast-path action is navigate to "Deployment"

  Scenario: Bare "deploy" (alias) navigates to Deployment
    When I parse "deploy"
    Then the fast-path action is navigate to "Deployment"

  Scenario: Bare "services" navigates to Service
    When I parse "services"
    Then the fast-path action is navigate to "Service"

  Scenario: Bare "svc" (alias) navigates to Service
    When I parse "svc"
    Then the fast-path action is navigate to "Service"

  Scenario: Bare "configmaps" navigates to ConfigMap
    When I parse "configmaps"
    Then the fast-path action is navigate to "ConfigMap"

  Scenario: Bare "cm" (alias) navigates to ConfigMap
    When I parse "cm"
    Then the fast-path action is navigate to "ConfigMap"

  Scenario: Bare "statefulsets" navigates to StatefulSet
    When I parse "statefulsets"
    Then the fast-path action is navigate to "StatefulSet"

  Scenario: Bare "sts" (alias) navigates to StatefulSet
    When I parse "sts"
    Then the fast-path action is navigate to "StatefulSet"

  Scenario: Bare "daemonsets" navigates to DaemonSet
    When I parse "daemonsets"
    Then the fast-path action is navigate to "DaemonSet"

  Scenario: Bare "ds" (alias) navigates to DaemonSet
    When I parse "ds"
    Then the fast-path action is navigate to "DaemonSet"

  Scenario: Bare "ingresses" navigates to Ingress
    When I parse "ingresses"
    Then the fast-path action is navigate to "Ingress"

  Scenario: Bare "ing" (alias) navigates to Ingress
    When I parse "ing"
    Then the fast-path action is navigate to "Ingress"

  Scenario: Bare "persistentvolumeclaims" navigates to PersistentVolumeClaim
    When I parse "persistentvolumeclaims"
    Then the fast-path action is navigate to "PersistentVolumeClaim"

  Scenario: Bare "pvc" (alias) navigates to PersistentVolumeClaim
    When I parse "pvc"
    Then the fast-path action is navigate to "PersistentVolumeClaim"

  Scenario: Bare "topics" (alias) navigates to KafkaTopic
    When I parse "topics"
    Then the fast-path action is navigate to "KafkaTopic"

  Scenario: Bare "nodes" navigates to Node
    When I parse "nodes"
    Then the fast-path action is navigate to "Node"

  Scenario: Bare "namespaces" navigates to Namespace
    When I parse "namespaces"
    Then the fast-path action is navigate to "Namespace"

  Scenario: Bare "secrets" navigates to Secret
    When I parse "secrets"
    Then the fast-path action is navigate to "Secret"

  Scenario: Bare "jobs" navigates to Job
    When I parse "jobs"
    Then the fast-path action is navigate to "Job"

  Scenario: Bare "cronjobs" navigates to CronJob
    When I parse "cronjobs"
    Then the fast-path action is navigate to "CronJob"

  # ---------------------------------------------------------------------------
  # Namespace filter — "<alias> in <namespace>"
  # ---------------------------------------------------------------------------

  Scenario: "pods in default" navigates to Pod and filters namespace
    When I parse "pods in default"
    Then the fast-path action is multi with steps:
      | navigate | Pod     |         |
      | filter   |         | default |

  Scenario: "deployments in kube-system" navigates and filters
    When I parse "deployments in kube-system"
    Then the fast-path action is multi with steps:
      | navigate | Deployment  |             |
      | filter   |             | kube-system |

  Scenario: "deploy in staging" (alias) navigates Deployment and filters
    When I parse "deploy in staging"
    Then the fast-path action is multi with steps:
      | navigate | Deployment |         |
      | filter   |            | staging |

  Scenario: "svc in production" (alias) navigates Service and filters
    When I parse "svc in production"
    Then the fast-path action is multi with steps:
      | navigate | Service    |            |
      | filter   |            | production |

  # ---------------------------------------------------------------------------
  # Error-state filter — "erroring|crashing|failing|broken <alias>?"
  # ---------------------------------------------------------------------------

  Scenario: "erroring pods" navigates to Pod with error filter
    When I parse "erroring pods"
    Then the fast-path action is multi with steps:
      | navigate | Pod |       |
      | filter   |     | error |

  Scenario: "crashing pods" navigates to Pod with error filter
    When I parse "crashing pods"
    Then the fast-path action is multi with steps:
      | navigate | Pod |       |
      | filter   |     | error |

  Scenario: "failing pods" navigates to Pod with error filter
    When I parse "failing pods"
    Then the fast-path action is multi with steps:
      | navigate | Pod |       |
      | filter   |     | error |

  Scenario: "broken pods" navigates to Pod with error filter
    When I parse "broken pods"
    Then the fast-path action is multi with steps:
      | navigate | Pod |       |
      | filter   |     | error |

  Scenario: "erroring" (no alias, implies pods) navigates to Pod with error filter
    When I parse "erroring"
    Then the fast-path action is multi with steps:
      | navigate | Pod |       |
      | filter   |     | error |

  Scenario: "crashing" alone navigates to Pod with error filter
    When I parse "crashing"
    Then the fast-path action is multi with steps:
      | navigate | Pod |       |
      | filter   |     | error |

  Scenario: "ERRORING PODS" (uppercase) navigates to Pod with error filter
    When I parse "ERRORING PODS"
    Then the fast-path action is multi with steps:
      | navigate | Pod |       |
      | filter   |     | error |

  # ---------------------------------------------------------------------------
  # Known-namespace bare names — filter namespace
  # ---------------------------------------------------------------------------

  Scenario: Bare known namespace "default" filters namespace
    Given the known namespaces are "default,kube-system,staging"
    When I parse "default"
    Then the fast-path action is filter namespace "default"

  Scenario: Bare known namespace "kube-system" filters namespace
    Given the known namespaces are "default,kube-system,staging"
    When I parse "kube-system"
    Then the fast-path action is filter namespace "kube-system"

  Scenario: Bare known namespace "staging" filters namespace
    Given the known namespaces are "default,kube-system,staging"
    When I parse "staging"
    Then the fast-path action is filter namespace "staging"

  # ---------------------------------------------------------------------------
  # No match — falls through (question words, comparatives, unmatched tokens)
  # ---------------------------------------------------------------------------

  Scenario: "what pods are crashing" falls through (question word)
    When I parse "what pods are crashing"
    Then the fast-path action is no match

  Scenario: "why is the pod failing" falls through (question word)
    When I parse "why is the pod failing"
    Then the fast-path action is no match

  Scenario: "how many deployments" falls through (question word)
    When I parse "how many deployments"
    Then the fast-path action is no match

  Scenario: "which namespace" falls through (question word)
    When I parse "which namespace"
    Then the fast-path action is no match

  Scenario: "find the order-api pod" falls through (unmatched tokens)
    When I parse "find the order-api pod"
    Then the fast-path action is no match

  Scenario: "show me the erroring pods" falls through (unmatched 'me the')
    When I parse "show me the erroring pods"
    Then the fast-path action is no match

  Scenario: "list all pods" falls through (unmatched 'all')
    When I parse "list all pods"
    Then the fast-path action is no match

  Scenario: Empty string falls through
    When I parse ""
    Then the fast-path action is no match

  Scenario: Random text falls through
    When I parse "hello world"
    Then the fast-path action is no match

  Scenario: "more pods than before" falls through (comparative)
    When I parse "more pods than before"
    Then the fast-path action is no match

  Scenario: "fewer deployments" falls through (comparative)
    When I parse "fewer deployments"
    Then the fast-path action is no match

  # Fast path never produces an answer action
  Scenario: Fast path result is never "answer"
    When I parse "what is a pod"
    Then the fast-path action is no match
