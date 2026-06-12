/**
 * useFocus hook — manages keyboard focus cycling across pane regions.
 * Spec 02 §5.
 */

import { useState } from 'react';
import type { FocusRegion } from './types.js';

export interface UseFocusResult {
  focus: FocusRegion;
  setFocus: (region: FocusRegion) => void;
  /** Cycle Tab: sidebar→list→detail→sidebar (if detailVisible), else sidebar→list→sidebar */
  cycleFocus: (detailVisible: boolean) => void;
  /** Cycle Shift+Tab reverse */
  cycleFocusReverse: (detailVisible: boolean) => void;
}

/**
 * Returns the next focus region in the forward cycle.
 * Falls back to 'sidebar' if the current region is not in the cycle.
 */
function nextFocus(current: FocusRegion, detailVisible: boolean): FocusRegion {
  if (detailVisible) {
    if (current === 'sidebar') {
      return 'list';
    }
    if (current === 'list') {
      return 'detail';
    }
    return 'sidebar';
  }
  if (current === 'sidebar') {
    return 'list';
  }
  return 'sidebar';
}

/**
 * Returns the previous focus region in the reverse cycle.
 * Falls back to the last element if current is not in the cycle.
 */
function prevFocus(current: FocusRegion, detailVisible: boolean): FocusRegion {
  if (detailVisible) {
    if (current === 'list') {
      return 'sidebar';
    }
    if (current === 'detail') {
      return 'list';
    }
    return 'detail';
  }
  if (current === 'list') {
    return 'sidebar';
  }
  return 'list';
}

export function useFocus(initialRegion: FocusRegion): UseFocusResult {
  const [focus, setFocus] = useState<FocusRegion>(initialRegion);

  function cycleFocus(detailVisible: boolean): void {
    setFocus((current) => nextFocus(current, detailVisible));
  }

  function cycleFocusReverse(detailVisible: boolean): void {
    setFocus((current) => prevFocus(current, detailVisible));
  }

  return { focus, setFocus, cycleFocus, cycleFocusReverse };
}
