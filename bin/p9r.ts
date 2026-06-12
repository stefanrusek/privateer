#!/usr/bin/env bun
// Real entry point. Lives outside src/ so the unavoidable "run on direct
// invocation" line is not part of the 100%-coverage surface; src/main.ts holds
// the (fully tested) composition logic.
//
// The compiled binary embeds the onnxruntime native library (the .node
// binding Bun extracts to $TMPDIR resolves its @rpath dylib from that same
// directory), so it must be materialized before any module loads
// onnxruntime-node. The import of main is dynamic for that reason.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ortDylibPath from '../node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64/libonnxruntime.1.24.3.dylib' with { type: 'file' };

// Bun embeds assets under content-hashed names; the onnxruntime .node
// binding Bun extracts to $TMPDIR resolves its @rpath dylib from that same
// directory, so it must be materialized under its canonical filename.
if (ortDylibPath.startsWith('/$bunfs')) {
  const target = join(tmpdir(), 'libonnxruntime.1.24.3.dylib');
  if (!existsSync(target)) {
    writeFileSync(target, readFileSync(ortDylibPath));
  }
}

const { main } = await import('../src/main.js');

main(process.argv.slice(2));
