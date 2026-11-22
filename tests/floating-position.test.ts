import { describe, it, expect } from 'vitest';
import { computePosition, observePosition } from '../src/shared/floating/position';
import type { ComputeOptions, Placement, RectLike, Size } from '../src/shared/floating/types';

const rect = (left: number, top: number, width: number, height: number): RectLike => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
});

const size = (width: number, height: number): Size => ({ width, height });

const VIEWPORT = { width: 1000, height: 800 };
const ANCHOR = rect(200, 300, 100, 40);
const FLOATING = size(80, 50);

const compute = (
    placement: Placement | 'auto',
    overrides: Partial<ComputeOptions> = {},
    anchor: RectLike = ANCHOR,
    floating: Size = FLOATING,
) =>
    computePosition(anchor, floating, {
        placement,
        viewport: VIEWPORT,
        offset: 8,
        boundaryPadding: 8,
        flip: true,
        shift: true,
        ...overrides,
    });

describe('computePosition: 12 方位基础定位', () => {
    const cases: Array<[Placement, number, number]> = [
        ['top', 210, 242],
        ['topLeft', 200, 242],
        ['topRight', 220, 242],
        ['bottom', 210, 348],
        ['bottomLeft', 200, 348],
        ['bottomRight', 220, 348],
        ['left', 112, 295],
        ['leftTop', 112, 300],
        ['leftBottom', 112, 290],
        ['right', 308, 295],
        ['rightTop', 308, 300],
        ['rightBottom', 308, 290],
    ];

    for (const [placement, x, y] of cases) {
        it(`${placement} 计算左上角`, () => {
            const result = compute(placement);
            expect(result.x).toBe(x);
            expect(result.y).toBe(y);
            expect(result.top).toBe(y);
            expect(result.left).toBe(x);
            expect(result.placement).toBe(placement);
        });
    }

    it('默认 offset 为 8，可通过参数覆盖', () => {
        expect(compute('top').y).toBe(242);
        expect(compute('top', { offset: 20 }).y).toBe(230);
        expect(compute('left', { offset: 20 }).x).toBe(100);
    });

    it('箭头：居中方位指向锚点中心，变体方位靠近对齐边', () => {
        expect(compute('top').arrow).toEqual({ x: 40 });
        expect(compute('topLeft').arrow).toEqual({ x: 16 });
        expect(compute('topRight').arrow).toEqual({ x: 64 });
        expect(compute('bottom').arrow).toEqual({ x: 40 });
        expect(compute('left').arrow).toEqual({ y: 25 });
        expect(compute('leftTop').arrow).toEqual({ y: 16 });
        expect(compute('leftBottom').arrow).toEqual({ y: 34 });
        expect(compute('right').arrow).toEqual({ y: 25 });
    });

    it('锚点大于浮层时，变体方位的箭头不会落到方位名相反的一侧', () => {
        // 0.8.0 声明式 tooltip 改为 JS 定位后暴露的回归：此前一律取锚点中心，
        // leftTop 的箭头被钳制到气泡底部（29），leftBottom 反倒落在顶部（8）。
        const bigAnchor = rect(200, 300, 80, 64);
        const smallFloating = size(120, 37);
        const topAligned = compute('leftTop', {}, bigAnchor, smallFloating);
        const bottomAligned = compute('leftBottom', {}, bigAnchor, smallFloating);

        expect(topAligned.arrow.y).toBe(16);
        expect(bottomAligned.arrow.y).toBe(21);
        expect(topAligned.arrow.y).toBeLessThan(smallFloating.height / 2);
        expect(bottomAligned.arrow.y).toBeGreaterThan(smallFloating.height / 2);
    });

    it('矩形缺少 right/bottom 时由 left/top + size 推导', () => {
        const bare: RectLike = { left: 200, top: 300, width: 100, height: 40 };
        const result = compute('bottomRight', {}, bare);
        expect(result.x).toBe(220);
        expect(result.y).toBe(348);
    });

    it('箭头靠近浮层边缘时保留 12px 内边距，避免压到圆角', () => {
        // 锚点在视口最右侧，浮层被 shift 回边界后箭头中心也不能贴住圆角
        const result = compute('top', { viewport: { width: 200, height: 800 } }, rect(190, 300, 10, 20), size(80, 40));
        expect(result.arrow.x).toBeGreaterThanOrEqual(12);
        expect(result.arrow.x).toBeLessThanOrEqual(80 - 12);
    });

    it('flipState 记录请求、首选与尝试顺序', () => {
        const result = compute('top');
        expect(result.flipState).toEqual({
            requested: 'top',
            preferred: 'top',
            final: 'top',
            flipped: false,
            tried: ['top'],
        });
        expect(result.overflow).toEqual({ main: 0, cross: 0 });
    });
});

describe('computePosition: flip（主轴翻转）', () => {
    it('上方空间不足时翻到下方，保持居中对齐', () => {
        const result = compute('top', {}, rect(200, 20, 100, 40));
        expect(result.placement).toBe('bottom');
        expect(result.y).toBe(68);
        expect(result.x).toBe(210);
        expect(result.flipState.flipped).toBe(true);
        expect(result.flipState.tried).toEqual(['top', 'bottom']);
        expect(result.arrow).toEqual({ x: 40 });
        expect(result.overflow.main).toBe(0);
    });

    it('翻转保持对齐方式：topLeft → bottomLeft', () => {
        const result = compute('topLeft', {}, rect(200, 20, 100, 40));
        expect(result.placement).toBe('bottomLeft');
        expect(result.x).toBe(200);
        expect(result.y).toBe(68);
    });

    it('水平方位同样翻转：leftTop → rightTop', () => {
        const result = compute('leftTop', {}, rect(20, 300, 100, 40));
        expect(result.placement).toBe('rightTop');
        expect(result.x).toBe(128);
        expect(result.y).toBe(300);
    });

    it('flip=false 时不翻转，主轴钳制到边界并记录溢出', () => {
        const result = compute('top', { flip: false }, rect(200, 20, 100, 40));
        expect(result.placement).toBe('top');
        expect(result.y).toBe(8);
        expect(result.x).toBe(210);
        expect(result.overflow.main).toBe(46);
        expect(result.flipState.flipped).toBe(false);
        expect(result.flipState.tried).toEqual(['top']);
    });

    it('两级回退：对侧仍溢出时选主轴溢出更小的一侧', () => {
        // 锚点被滚出视口上方：top 溢出 96，bottom 溢出 40
        const result = compute('top', { viewport: { width: 100, height: 100 } }, rect(10, -50, 20, 10), size(40, 30));
        expect(result.placement).toBe('bottom');
        expect(result.flipState.flipped).toBe(true);
        expect(result.flipState.tried).toEqual(['top', 'bottom']);
        expect(result.overflow.main).toBe(40);
        expect(result.y).toBe(8);
    });

    it('对侧更差时保留首选，不劣化视觉结果', () => {
        // 锚点高度超过视口（长列表滚动场景）：
        // top 主轴溢出 216，bottom 溢出 266 → top 更优，不应翻转
        const result = compute(
            'top',
            { viewport: { width: 200, height: 200 } },
            rect(0, -100, 100, 450),
            size(80, 100),
        );
        expect(result.placement).toBe('top');
        expect(result.flipState.flipped).toBe(false);
        expect(result.flipState.tried).toEqual(['top', 'bottom']);
        expect(result.overflow.main).toBe(216);
        expect(result.y).toBe(8);
    });
});

describe('computePosition: shift（交叉轴平移）', () => {
    it('右侧越界时沿交叉轴平移回边界内，箭头跟随反向偏移', () => {
        const result = compute('bottomLeft', { viewport: { width: 950, height: 800 } }, rect(880, 300, 100, 40));
        expect(result.x).toBe(862);
        expect(result.y).toBe(348);
        expect(result.arrow).toEqual({ x: 34 });
        expect(result.overflow.cross).toBe(0);
    });

    it('shift=false 时保留越界并记录交叉轴溢出', () => {
        const result = compute(
            'bottomLeft',
            { viewport: { width: 950, height: 800 }, shift: false },
            rect(880, 300, 100, 40),
        );
        expect(result.x).toBe(880);
        expect(result.arrow).toEqual({ x: 16 });
        expect(result.overflow.cross).toBe(18);
    });

    it('水平方位的垂直平移与箭头钳制', () => {
        const result = compute('right', { viewport: { width: 1000, height: 800 } }, rect(100, 790, 100, 20));
        expect(result.y).toBe(742);
        // 箭头中心按 [12, size-12] 钳制，避免压到圆角
        expect(result.arrow).toEqual({ y: 38 });
        expect(result.overflow.cross).toBe(0);
    });
});

describe('computePosition: auto 选择', () => {
    it('可用空间优先：选能完整容纳且空间最大的一侧', () => {
        const result = compute('auto', { viewport: { width: 400, height: 400 } }, rect(100, 100, 100, 40));
        expect(result.placement).toBe('bottom');
        expect(result.flipState.requested).toBe('auto');
        expect(result.flipState.preferred).toBe('bottom');
        expect(result.x).toBe(110);
        expect(result.y).toBe(148);
    });

    it('可用空间并列时按 top → bottom → right → left 决胜', () => {
        const result = compute('auto', { viewport: { width: 400, height: 400 } }, rect(150, 180, 100, 40));
        expect(result.placement).toBe('top');
        expect(result.x).toBe(160);
        expect(result.y).toBe(122);
    });

    it('只有一侧能完整容纳时选该侧', () => {
        const result = compute('auto', { viewport: { width: 200, height: 60 } }, rect(20, 20, 40, 20), size(40, 20));
        expect(result.placement).toBe('right');
        expect(result.x).toBe(68);
        expect(result.y).toBe(20);
    });

    it('四侧都不完整时选溢出最小的一侧，并走 flip 两级回退', () => {
        const result = compute('auto', { viewport: { width: 100, height: 100 } }, rect(10, 40, 20, 20), size(80, 80));
        // 四侧溢出：top 86、bottom 56、right 26、left 86 → right 最小
        expect(result.placement).toBe('right');
        expect(result.flipState.preferred).toBe('right');
        expect(result.flipState.flipped).toBe(false);
        expect(result.flipState.tried).toEqual(['right', 'left']);
        expect(result.overflow.main).toBe(26);
        expect(result.x).toBe(12);
        expect(result.y).toBe(10);
        expect(result.arrow).toEqual({ y: 40 });
    });
});

describe('computePosition: 大于可用空间的降级', () => {
    it('浮层大于视口时贴住起点边界，并同时报告主轴与交叉轴溢出', () => {
        const result = compute(
            'top',
            { viewport: { width: 200, height: 200 }, flip: false },
            rect(80, 80, 40, 40),
            size(300, 300),
        );
        expect(result.x).toBe(8);
        expect(result.y).toBe(8);
        expect(result.overflow.main).toBe(236);
        expect(result.overflow.cross).toBe(116);
        expect(result.placement).toBe('top');
        // 箭头仍钳制在浮层内
        expect(result.arrow.x).toBe(92);
    });

    it('浮层尺寸小于 16 时箭头取中点（避免上下界倒置）', () => {
        const result = compute(
            'bottomLeft',
            { viewport: { width: 400, height: 800 } },
            rect(100, 300, 100, 40),
            size(12, 50),
        );
        expect(result.arrow).toEqual({ x: 6 });
    });
});

describe('computePosition: 坐标空间', () => {
    it('fixed 直接使用视口坐标，不叠加滚动量', () => {
        const result = compute('top');
        expect(result).toMatchObject({ x: 210, y: 242 });
    });

    it('absolute 按 C-OVL-03 换算到容器坐标（含滚动与边框）', () => {
        const result = compute('top', {
            strategy: 'absolute',
            container: {
                rect: rect(50, 60, 400, 300),
                scrollLeft: 30,
                scrollTop: 20,
                clientLeft: 2,
                clientTop: 1,
            },
        });
        expect(result.x).toBe(188);
        expect(result.y).toBe(201);
        expect(result.top).toBe(201);
        expect(result.left).toBe(188);
        expect(result.overflow).toEqual({ main: 0, cross: 0 });
    });
});

describe('observePosition: 滚动祖先重定位', () => {
    /** rAF（或 16ms 回退定时器）批处理后的稳定等待窗口 */
    const flush = () => new Promise(resolve => setTimeout(resolve, 50));

    const createShadowAnchor = () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const scroller = document.createElement('div');
        const anchor = document.createElement('button');
        const floating = document.createElement('div');
        scroller.appendChild(anchor);
        scroller.appendChild(floating);
        shadow.appendChild(scroller);
        return { host, scroller, anchor, floating };
    };

    it('Shadow DOM 内滚动容器滚动时触发重定位（scroll 不冒泡也不跨 shadow boundary）', async () => {
        const { host, scroller, anchor, floating } = createShadowAnchor();
        let calls = 0;
        const stop = observePosition({ anchor, floating, update: () => (calls += 1) });

        scroller.dispatchEvent(new Event('scroll', { bubbles: false, composed: false }));
        await flush();
        expect(calls).toBe(1);

        // document 级滚动仍由全局 capture 监听覆盖，不能因为新增祖先订阅而退化
        window.dispatchEvent(new Event('scroll'));
        await flush();
        expect(calls).toBe(2);

        stop();
        scroller.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scroll'));
        await flush();
        expect(calls).toBe(2);

        host.remove();
    });

    it('清理函数幂等，停止后不再响应滚动', async () => {
        const { host, scroller, anchor, floating } = createShadowAnchor();
        let calls = 0;
        const stop = observePosition({ anchor, floating, update: () => (calls += 1) });
        stop();
        stop();

        scroller.dispatchEvent(new Event('scroll'));
        await flush();
        expect(calls).toBe(0);

        host.remove();
    });

    it('同一滚动祖先上的多个订阅互不影响', async () => {
        const { host, scroller, anchor, floating } = createShadowAnchor();
        const secondAnchor = document.createElement('button');
        const secondFloating = document.createElement('div');
        scroller.appendChild(secondAnchor);
        scroller.appendChild(secondFloating);

        let firstCalls = 0;
        let secondCalls = 0;
        const stopFirst = observePosition({ anchor, floating, update: () => (firstCalls += 1) });
        const stopSecond = observePosition({
            anchor: secondAnchor,
            floating: secondFloating,
            update: () => (secondCalls += 1),
        });

        // 两个订阅共用 scroller 作为滚动祖先；只停止第一个不能摘掉第二个的监听
        stopFirst();
        scroller.dispatchEvent(new Event('scroll'));
        await flush();
        expect(firstCalls).toBe(0);
        expect(secondCalls).toBe(1);

        stopSecond();
        host.remove();
    });
});
