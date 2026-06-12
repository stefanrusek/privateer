import type { EventEmitter } from 'node:events';

/** Yield to the macrotask queue so Ink effects / React commits can flush. */
export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait until Ink has subscribed to the fake stdin, then write.
 *
 * ink-testing-library's Stdin is an EventEmitter whose `write` emits
 * 'readable' + 'data'; Ink only attaches its 'readable' listener in an
 * effect after the first render. Writing before that listener exists
 * silently drops the keystroke, which made keypress tests flaky under
 * host CPU load. This helper polls for the subscription, writes, then
 * yields twice so React can commit any handler updates triggered by the
 * keypress before the next write or assertion.
 */
export async function safeWrite(
  stdin: { write: (data: string) => void },
  data: string,
): Promise<void> {
  const emitter = stdin as unknown as EventEmitter;
  for (let i = 0; i < 400 && emitter.listenerCount('readable') === 0; i++) {
    await tick();
  }
  stdin.write(data);
  await tick();
  await tick();
}
