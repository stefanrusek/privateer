/**
 * usePaneRatios hook — loads and persists sidebar/vertical split ratios
 * from the ConfigStore (Spec 02 §5).
 */

import { useState, useEffect } from 'react';
import type { ConfigStore } from '../boundaries/config-store.js';

export interface UsePaneRatiosResult {
  sidebarRatio: number;
  verticalRatio: number;
  setSidebarRatio: (ratio: number) => void;
  setVerticalRatio: (ratio: number) => void;
}

const DEFAULT_SIDEBAR_RATIO = 0.2;
const DEFAULT_VERTICAL_RATIO = 0.6;
const KEY_SIDEBAR = 'ui.sidebarRatio';
const KEY_VERTICAL = 'ui.verticalRatio';

export function usePaneRatios(configStore: ConfigStore): UsePaneRatiosResult {
  const [sidebarRatio, setSidebarRatioState] = useState<number>(
    DEFAULT_SIDEBAR_RATIO,
  );
  const [verticalRatio, setVerticalRatioState] = useState<number>(
    DEFAULT_VERTICAL_RATIO,
  );

  useEffect(() => {
    configStore
      .load()
      .then((result) => {
        if (result.ok) {
          const cfg = result.value;
          const sr = cfg[KEY_SIDEBAR];
          const vr = cfg[KEY_VERTICAL];
          if (typeof sr === 'number') {
            setSidebarRatioState(sr);
          }
          if (typeof vr === 'number') {
            setVerticalRatioState(vr);
          }
        }
      })
      .catch(() => {
        // Load errors are non-fatal; keep defaults
      });
  }, [configStore]);

  function setSidebarRatio(ratio: number): void {
    setSidebarRatioState(ratio);
    configStore.save({ [KEY_SIDEBAR]: ratio }).catch(() => {
      // Save errors are non-fatal
    });
  }

  function setVerticalRatio(ratio: number): void {
    setVerticalRatioState(ratio);
    configStore.save({ [KEY_VERTICAL]: ratio }).catch(() => {
      // Save errors are non-fatal
    });
  }

  return { sidebarRatio, verticalRatio, setSidebarRatio, setVerticalRatio };
}
