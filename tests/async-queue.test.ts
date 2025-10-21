import { describe, it, expect, vi, afterEach } from 'vitest';

describe('utils/async-queue.runInAsyncQueue', () => {
  const originalRAF = globalThis.requestAnimationFrame;
  const originalPromise = globalThis.Promise;
  const originalSetTimeout = globalThis.setTimeout;

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF as any;
    globalThis.Promise = originalPromise as any;
    globalThis.setTimeout = originalSetTimeout as any;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('uses requestAnimationFrame when available', async () => {
    // 模拟 requestAnimationFrame 可用
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1 as any;
    });

    let ran = false;
    vi.resetModules();
    const { runInAsyncQueue } = await import('../src/utils/async-queue');
    runInAsyncQueue(() => { ran = true; });

    expect(rafSpy).toHaveBeenCalled();
    expect(ran).toBe(true);
  });

  it('falls back to Promise when requestAnimationFrame is missing', async () => {
    // 模拟 requestAnimationFrame 不可用
    (globalThis as any).requestAnimationFrame = undefined;

    let ran = false;
    vi.resetModules();
    const { runInAsyncQueue } = await import('../src/utils/async-queue');
    runInAsyncQueue(() => { ran = true; });

    // flush microtask queued by Promise.then
    await Promise.resolve();

    expect(ran).toBe(true);
  });
});