/**
 * Full-object YAML cache resolution (P9R-0016 story 1b).
 *
 * The live store strips `metadata.managedFields` from every stored resource
 * before it ever reaches state (memory economy across thousands of watched
 * objects — see `stripHeavyFields` in `src/store/state-store.ts` and the
 * BDD scenario pinning that strip). That means the YAML tab's normal data
 * source (`detail.resource.raw`) never has `managedFields`, so the
 * `[managed]` chip and `m` toggle built in this module's sibling
 * (`managed-fields.ts`) were unreachable: `hasManagedFields()` was always
 * false on the ordinary open path.
 *
 * The fix fetches the full, unstripped object on demand (the same
 * `client.get` round trip `yamlReload` already performs for 409 recovery)
 * and caches it for the currently open detail pane. This module is the pure
 * decision of *which* YAML string to hand the tab: the freshly fetched one
 * when it's for the resource currently open, the stored (possibly
 * managedFields-stripped) fallback otherwise — while a fetch is in flight,
 * after it fails, or before any fetch was attempted at all.
 */

/** A single cached full-object YAML dump, keyed to the resource it's for. */
export interface YamlCacheEntry {
  readonly uid: string;
  readonly yaml: string;
}

/**
 * Pick the YAML to render for `uid`: the cached full-object dump when the
 * cache holds an entry for that exact uid, otherwise `fallback` (the
 * store's stripped `raw`, serialized by the caller).
 */
export function resolveDetailYaml(
  cache: YamlCacheEntry | null,
  uid: string,
  fallback: string,
): string {
  if (cache !== null && cache.uid === uid && uid !== '') {
    return cache.yaml;
  }
  return fallback;
}

/**
 * Whether a full-object fetch should be (re)started for `uid`: not when a
 * fetch for that exact uid is already in flight, and not when the cache
 * already holds that uid's result.
 */
export function shouldFetchFullYaml(
  cache: YamlCacheEntry | null,
  inFlightUid: string | null,
  uid: string,
): boolean {
  if (uid === '') {
    return false;
  }
  if (inFlightUid === uid) {
    return false;
  }
  if (cache !== null && cache.uid === uid) {
    return false;
  }
  return true;
}
