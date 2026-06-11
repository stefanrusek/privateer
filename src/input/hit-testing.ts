/**
 * Hit-testing registry. Spec 01 §3.5.
 *
 * Components register their bounding boxes each render pass. The input layer
 * routes mouse events to the topmost registered region (highest z; ties broken
 * by registration order — last-registered wins).
 */

export interface Region {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Per-frame hit-testing registry. Call `register()` once per region per render
 * pass, then `hitTest()` for each mouse event. Call `clear()` at the start of
 * each render pass to reset the registry.
 */
export class HitTestRegistry {
  private regions: Region[] = [];

  /**
   * Register a bounding box for the current frame. Regions registered later in
   * the same frame break ties when z values are equal.
   */
  register(region: Region): void {
    this.regions.push(region);
  }

  /**
   * Return the id of the topmost region that contains `point`, or null if no
   * region covers that point.
   *
   * "Topmost" = highest z; among equal z values, the last-registered region
   * wins (i.e. iterate in reverse registration order).
   */
  hitTest(point: Point): string | null {
    let best: Region | null = null;
    for (const region of this.regions) {
      if (!containsPoint(region, point)) {
        continue;
      }
      if (best === null || region.z > best.z || region.z === best.z) {
        // last-registered wins on ties (we scan forward, so later index wins)
        best = region;
      }
    }
    return best !== null ? best.id : null;
  }

  /** Reset the registry for the next frame. */
  clear(): void {
    this.regions = [];
  }
}

function containsPoint(region: Region, point: Point): boolean {
  return (
    point.x >= region.x &&
    point.x < region.x + region.width &&
    point.y >= region.y &&
    point.y < region.y + region.height
  );
}
