import { setWorldConstructor, World } from '@cucumber/cucumber';
import { createApp } from '../../src/app.js';

/**
 * Cucumber World — composes the real application with fakes only at process
 * boundaries (Spec 08 §3.3). For the scaffold the only boundary is the output
 * sink; later chunks add the in-memory kubeconfig, fake TTY, fake clock, fake
 * Prometheus, and recorded model fixtures.
 */
export class PrivateerWorld extends World {
  output: string[] = [];

  runApp(argv: readonly string[]): void {
    createApp({
      argv,
      write: (line) => {
        this.output.push(line);
      },
    }).run();
  }
}

setWorldConstructor(PrivateerWorld);
