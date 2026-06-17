Feature: Delete confirmation dialog
  As a Privateer user
  I want to confirm before deleting a Kubernetes resource
  So that I do not accidentally remove critical workloads

  Scenario: Pressing d on a selected resource opens the confirm dialog
    Given a delete confirm dialog for kind "Pod" named "my-pod" in namespace "default"
    Then the delete dialog frame contains "my-pod"
    And the delete dialog frame contains "Cancel"

  Scenario: Default selection is Confirm so Enter confirms
    Given a delete confirm dialog for kind "Pod" named "my-pod" in namespace "default"
    Then the delete dialog default selection is "Confirm"

  Scenario: Enter on the default selection calls onConfirm and not onCancel
    Given a delete confirm dialog for kind "Pod" named "my-pod" in namespace "default"
    When I press Enter on the delete dialog
    Then onConfirm was called
    And onCancel was not called

  Scenario: Navigating to Cancel and pressing Enter calls onCancel
    Given a delete confirm dialog for kind "Pod" named "my-pod" in namespace "default"
    When I press the right arrow on the delete dialog
    And I press Enter on the delete dialog
    Then onCancel was called
    And onConfirm was not called

  Scenario: Escape always calls onCancel regardless of selection
    Given a delete confirm dialog for kind "Pod" named "my-pod" in namespace "default"
    When I press Escape on the delete dialog
    Then onCancel was called
    And onConfirm was not called

  Scenario: Deployment shows cascade warning message
    Given a delete confirm dialog for kind "Deployment" named "order-api" in namespace "default"
    Then the delete dialog frame contains "pods"

  Scenario: StatefulSet shows cascade warning message
    Given a delete confirm dialog for kind "StatefulSet" named "my-db" in namespace "default"
    Then the delete dialog frame contains "pods"

  Scenario: Pod shows simple delete message without cascade warning
    Given a delete confirm dialog for kind "Pod" named "simple-pod" in namespace "kube-system"
    Then the delete dialog frame contains "simple-pod"
    And the delete dialog frame contains "kube-system"

  Scenario: Destructive confirm button renders in red
    Given a destructive delete confirm dialog for kind "Pod" named "my-pod" in namespace "default"
    Then the delete dialog has a destructive confirm button

  Scenario: executeDelete succeeds when resource exists
    Given a fake kube client with a "Pod" named "target-pod" in namespace "default"
    When I execute delete for kind "Pod" named "target-pod" in namespace "default"
    Then the delete result is ok

  Scenario: executeDelete returns error when resource not found
    Given a fake kube client with no resources
    When I execute delete for kind "Pod" named "missing-pod" in namespace "default"
    Then the delete result is an error

  Scenario: buildDeleteConfirmMessage for Deployment includes cascade note
    When I build the delete confirm message for kind "Deployment" named "my-deploy" in namespace "prod"
    Then the delete confirm message contains "pods"
    And the delete confirm message contains "my-deploy"
    And the delete confirm message contains "prod"

  Scenario: buildDeleteConfirmMessage for StatefulSet includes cascade note
    When I build the delete confirm message for kind "StatefulSet" named "my-sts" in namespace "prod"
    Then the delete confirm message contains "pods"
    And the delete confirm message contains "my-sts"

  Scenario: buildDeleteConfirmMessage for Pod is simple
    When I build the delete confirm message for kind "Pod" named "my-pod" in namespace "default"
    Then the delete confirm message does not contain "pods"
    And the delete confirm message contains "my-pod"
    And the delete confirm message contains "default"

  Scenario: buildDeleteConfirmMessage for Service is simple
    When I build the delete confirm message for kind "Service" named "my-svc" in namespace "staging"
    Then the delete confirm message does not contain "pods"
    And the delete confirm message contains "my-svc"
    And the delete confirm message contains "staging"
