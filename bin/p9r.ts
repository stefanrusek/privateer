#!/usr/bin/env bun
// Real entry point. Lives outside src/ so the unavoidable "run on direct
// invocation" line is not part of the 100%-coverage surface; src/main.ts holds
// the (fully tested) composition logic.
import { main } from '../src/main.js';

main();
