/**
 * CoordinateInput 元素组件测试
 *
 * 组件通过 <solely-coordinate-input> 自定义元素使用（import 即自动注册）。
 * 重点测试：十进制 <-> 度分秒(DMS) 的解析/格式化逻辑、字段校验、命令式 API。
 * 参考 tests/components/table.test.ts 的挂载方式（设置 attribute 后 append，再 tick）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Coordinate } from '../../src/components/elements/coordinate-input/types';

// 引入组件即自动注册自定义元素 <solely-coordinate-input>（sideEffects 已覆盖）
import '../../src/components/elements/coordinate-input';

const tick = () => new Promise<void>(r => setTimeout(r, 20));

function createInput(attrs: Record<string, string> = {}): any {
    const el = document.createElement('solely-coordinate-input') as any;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el;
}

describe('solely-coordinate-input', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('基本渲染：包含经纬度度分秒输入框且 $refs 可用', async () => {
        const el = createInput();
        await tick();

        expect(el.shadowRoot).not.toBeNull();
        // $refs 正确指向模板中的 input
        expect(el.$refs.latitudeDegreesInput).toBeInstanceOf(HTMLInputElement);
        expect(el.$refs.latitudeMinutesInput).toBeInstanceOf(HTMLInputElement);
        expect(el.$refs.latitudeSecondsInput).toBeInstanceOf(HTMLInputElement);
        expect(el.$refs.longitudeDegreesInput).toBeInstanceOf(HTMLInputElement);
        // 默认 type=both -> 容器含 horizontal；默认 size=medium -> md
        const cls = el.getContainerClasses();
        expect(cls).toContain('coordinate-input--horizontal');
        expect(cls).toContain('coordinate-input--md');
    });

    it('属性生效：latitude/longitude 十进制自动解析为 DMS', async () => {
        const el = createInput({ latitude: '45.5', longitude: '-73.5' });
        await tick();

        // 十进制值原样保留在 value 中
        const value: Coordinate = el.value;
        expect(value.latitude).toBeCloseTo(45.5, 6);
        expect(value.longitude).toBeCloseTo(-73.5, 6);

        const lat = el.getDmsCoordinateValue().latitude;
        expect(lat.degrees).toBe(45);
        expect(lat.minutes).toBe(30);
        expect(lat.seconds).toBe(0);
        expect(lat.direction).toBe('N');

        const lng = el.getDmsCoordinateValue().longitude;
        expect(lng.degrees).toBe(73);
        expect(lng.minutes).toBe(30);
        expect(lng.direction).toBe('W');

        // 输入框应回显解析后的度/分值
        expect(el.$refs.latitudeDegreesInput.value).toBe('45');
        expect(el.$refs.latitudeMinutesInput.value).toBe('30');
    });

    it('坐标解析：通过度/分输入框输入可转换为十进制', async () => {
        const el = createInput();
        await tick();

        const deg = el.$refs.latitudeDegreesInput as HTMLInputElement;
        const min = el.$refs.latitudeMinutesInput as HTMLInputElement;

        deg.value = '40';
        deg.dispatchEvent(new Event('input', { bubbles: true }));
        min.value = '30';
        min.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        // 40°30′ -> 40.5
        expect(el.value.latitude).toBeCloseTo(40.5, 6);
    });

    it('边界/校验：度输入框超出范围被钳制，非法空输入按 0 处理', async () => {
        // 超限钳制：纬度度最大 90
        const el = createInput({ latitude: '30' });
        await tick();
        const deg = el.$refs.latitudeDegreesInput as HTMLInputElement;
        deg.value = '200';
        deg.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(el.value.latitude).toBe(90);

        // 非法（空）输入 -> 视为 0，纬度随之归零
        deg.value = '';
        deg.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(el.value.latitude).toBe(0);
    });

    it('格式化：precision 影响秒输入框占位符与 step', async () => {
        const el = createInput();
        await tick();

        el.precision = 2;
        expect(el.getSecondsPlaceholder()).toBe('00.00');
        expect(el.getSecondsStep()).toBe('0.01');

        el.precision = 0;
        expect(el.getSecondsPlaceholder()).toBe('00');
        expect(el.getSecondsStep()).toBe('1');
    });

    it('命令式 API：setValue / 负数方向 / clear', async () => {
        const el = createInput();
        await tick();

        // 数组形式设置坐标
        el.value = [10.5, 20.25];
        expect(el.getValue()).toEqual({ latitude: 10.5, longitude: 20.25 });

        // 负值纬度 -> 方向 S，且十进制符号翻转
        el.setValue(-40.5, 0);
        expect(el.value.latitude).toBeCloseTo(-40.5, 6);
        expect(el.getDmsCoordinateValue().latitude.direction).toBe('S');

        // clear 派发 clear 事件并归零
        let cleared = false;
        el.addEventListener('clear', () => {
            cleared = true;
        });
        el.clear();
        expect(el.value.latitude).toBe(0);
        expect(el.value.longitude).toBe(0);
        expect(cleared).toBe(true);
    });

    it('disabled 时输入事件不更新坐标值', async () => {
        const el = createInput({ latitude: '12', disabled: '' });
        await tick();

        const deg = el.$refs.latitudeDegreesInput as HTMLInputElement;
        deg.value = '99';
        deg.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        // disabled 下 handleDmsInput 直接 return，值保持原样
        expect(el.value.latitude).toBe(12);
        // 输入框 class 含 disabled
        expect(el.getDmsInputClasses('latitude')).toContain('dms-input--disabled');
    });

    it('方向选择器：showDirection 渲染下拉，toggleDirection 与 selectDirection 生效', async () => {
        const el = createInput({ latitude: '12', 'show-direction': '' });
        await tick();

        // 渲染了方向选择元素
        expect(el.shadowRoot.querySelector('.dms-input__direction')).not.toBeNull();

        // 打开纬度方向下拉
        el.toggleDirection('latitude');
        expect(el.$data.latitudeDirectionOpen).toBe(true);

        // 选择 S 方向 -> 纬度由正变负（12 -> -12）
        el.selectDirection('latitude', 'S');
        expect(el.value.latitude).toBe(-12);
        expect(el.getDmsCoordinateValue().latitude.direction).toBe('S');
        expect(el.$data.latitudeDirectionOpen).toBe(false);
    });
});
