import { describe, it, expect, afterEach, vi } from 'vitest';

describe('env', () => {
    afterEach(() => {
        delete (globalThis as Record<string, unknown>).__IS_PROD__;
        delete (globalThis as Record<string, unknown>).__DEBUG__;
        delete (globalThis as Record<string, unknown>).__IS_DEV__;
        vi.resetModules();
    });

    it('should treat localhost as dev by default', async () => {
        vi.resetModules();
        const { IS_DEV, IS_PROD } = await import('../src/shared/env');

        expect(IS_DEV).toBe(true);
        expect(IS_PROD).toBe(false);
    });

    it('should let __IS_PROD__ override localhost detection', async () => {
        (globalThis as Record<string, unknown>).__IS_PROD__ = true;
        vi.resetModules();
        const { IS_DEV, IS_PROD } = await import('../src/shared/env');

        expect(IS_DEV).toBe(false);
        expect(IS_PROD).toBe(true);
    });

    it('should let __DEBUG__ force dev mode', async () => {
        (globalThis as Record<string, unknown>).__DEBUG__ = true;
        vi.resetModules();
        const { IS_DEV } = await import('../src/shared/env');

        expect(IS_DEV).toBe(true);
    });
});
