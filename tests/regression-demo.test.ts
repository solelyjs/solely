import { describe, it, expect, beforeAll, vi } from 'vitest';

/**
 * 回归演示页冒烟测试
 *
 * `examples/regression` 是给人工直观验证用的页面，这里保证它本身不会腐化：
 * 页面能挂载、12 个用例自动跑完且全部通过，并且可以重复运行。
 */
describe('examples/regression demo', () => {
    beforeAll(async () => {
        await import('../examples/regression/index');
    });

    it('should run every case and report 12/12 passed', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const element = document.createElement('regression-demo') as unknown as {
            $data: Record<string, string>;
            runAll: () => Promise<void>;
            remove: () => void;
        };
        document.body.appendChild(element as unknown as Node);

        await vi.waitFor(
            () => {
                expect(element.$data.summary).toMatch(/\d+\/12 通过/);
            },
            { timeout: 5000 },
        );

        expect(element.$data.summary).toBe('12/12 通过 ✅');

        const resultKeys = [
            'rBlank',
            'rMulti',
            'rReflect',
            'rSetter',
            'rEvent',
            'rUrl',
            'rSvg',
            'rDispose',
            'rKeepAlive',
            'rRouterReady',
            'rShared',
            'rChain',
        ];
        for (const key of resultKeys) {
            expect(element.$data[key], key).toContain('✅ 通过');
        }
        expect(element.$data.rEnv).toContain('IS_DEV');

        // 两条预期告警会被回显到控制台，测试里用 spy 收集并断言
        expect(warnSpy.mock.calls.some(call => String(call[0]).includes('Blocked unsafe URL'))).toBe(true);
        expect(warnSpy.mock.calls.some(call => String(call[0]).includes('已被其他实例使用'))).toBe(true);

        // 重跑一次，确认用例可重复执行（setter/event 计数按增量判断）
        await element.runAll();
        expect(element.$data.summary).toBe('12/12 通过 ✅');

        element.remove();
        warnSpy.mockRestore();
    });
});
