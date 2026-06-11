/**
 * AgentTab — persistent conversation panel in the detail pane.
 * Spec 07 §7. Prop-driven, frame-tested.
 *
 * Displays up to last 20 exchanges. Each exchange shows:
 *   > {user query}     (bright white)
 *   ↳ {action label}   (dim cyan, if navigate/filter)
 *     {answer text}    (normal white, if answer)
 *   Error text         (yellow, if unknown)
 *
 * [Clear history] button clears conversation.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { AgentAction } from '../../command/action.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentExchange {
  query: string;
  action: AgentAction | null;
  /** If thinking is still in progress (spinner state). */
  pending?: boolean;
  /** Timeout or error message, if any. */
  errorMessage?: string;
}

export interface AgentTabProps {
  exchanges: readonly AgentExchange[];
  onClearHistory: () => void;
  showTimestamps?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_EXCHANGES = 20;

function actionLabel(action: AgentAction): string {
  switch (action.action) {
    case 'navigate':
      return `Navigated to ${action.resource}`;
    case 'filter': {
      const parts: string[] = [];
      if (action.namespace !== undefined && action.namespace.length > 0) {
        parts.push(`namespace: ${action.namespace}`);
      }
      if (action.search !== undefined && action.search.length > 0) {
        parts.push(`search: ${action.search}`);
      }
      return parts.length > 0
        ? `Filtered — ${parts.join(', ')}`
        : 'Filter applied';
    }
    case 'multi': {
      const labels = action.steps
        .filter((s) => s.action === 'navigate' || s.action === 'filter')
        .map((s) => actionLabel(s));
      return labels.join('; ');
    }
    case 'answer':
      return '';
    case 'unknown':
      return '';
  }
}

// ---------------------------------------------------------------------------
// ExchangeView — renders a single exchange
// ---------------------------------------------------------------------------

interface ExchangeViewProps {
  exchange: AgentExchange;
  index: number;
}

function ExchangeView({
  exchange,
  index: _index,
}: ExchangeViewProps): React.ReactElement {
  const { query, action, pending, errorMessage } = exchange;

  // Query line
  const queryLine = (
    <Box flexDirection="row">
      <Text bold color="white">
        {'> '}
        {query}
      </Text>
    </Box>
  );

  // Pending state
  if (pending === true) {
    return (
      <Box flexDirection="column">
        {queryLine}
        <Box flexDirection="row">
          <Text dimColor>{'  thinking…'}</Text>
        </Box>
      </Box>
    );
  }

  // Error/timeout
  if (errorMessage !== undefined) {
    return (
      <Box flexDirection="column">
        {queryLine}
        <Box flexDirection="row">
          <Text dimColor color="cyan">
            {'↳ '}
          </Text>
          <Text color="yellow">{errorMessage}</Text>
        </Box>
      </Box>
    );
  }

  if (action === null) {
    return <Box flexDirection="column">{queryLine}</Box>;
  }

  // Action line
  const label = actionLabel(action);

  if (action.action === 'unknown') {
    return (
      <Box flexDirection="column">
        {queryLine}
        <Box flexDirection="row">
          <Text color="yellow">
            {
              'I couldn\'t understand that. Try: "show me erroring pods", "how many deployments are in default", "find the order-api deployment".'
            }
          </Text>
        </Box>
      </Box>
    );
  }

  if (action.action === 'answer') {
    return (
      <Box flexDirection="column">
        {queryLine}
        <Box flexDirection="row">
          <Text>
            {'  '}
            {action.text}
          </Text>
        </Box>
      </Box>
    );
  }

  // Navigate, filter, multi — show action label (and answer text if multi contains answer)
  const answerSteps =
    action.action === 'multi'
      ? action.steps.filter(
          (s): s is AgentAction & { action: 'answer' } => s.action === 'answer',
        )
      : [];

  return (
    <Box flexDirection="column">
      {queryLine}
      {label.length > 0 && (
        <Box flexDirection="row">
          <Text dimColor color="cyan">
            {'↳ '}
          </Text>
          <Text dimColor color="cyan">
            {label}
          </Text>
        </Box>
      )}
      {answerSteps.map((s, i) => (
        <Box key={i} flexDirection="row">
          <Text>
            {'  '}
            {s.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// AgentTab component
// ---------------------------------------------------------------------------

export function AgentTab({
  exchanges,
  onClearHistory: _onClearHistory,
  showTimestamps: _showTimestamps,
}: AgentTabProps): React.ReactElement {
  const visibleExchanges = exchanges.slice(-MAX_EXCHANGES);

  if (visibleExchanges.length === 0) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="column">
          <Text dimColor>Ask anything about your cluster.</Text>
          <Text dimColor>
            Try: &quot;show me erroring pods&quot;, &quot;how many deployments
            are in default&quot;
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan" underline>
            [Clear history]
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {visibleExchanges.map((exchange, i) => (
          <Box
            key={i}
            flexDirection="column"
            marginBottom={i < visibleExchanges.length - 1 ? 1 : 0}
          >
            <ExchangeView exchange={exchange} index={i} />
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="cyan" underline>
          [Clear history]
        </Text>
      </Box>
    </Box>
  );
}
