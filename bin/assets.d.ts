/** Bun `with { type: 'file' }` asset imports resolve to a path string. */
declare module '*.dylib' {
  const path: string;
  export default path;
}
