/**
 * Solely CoordinateInput 组件
 * 经纬度输入框，支持度分秒（DMS）格式
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { CoordinateInputProps, CoordinateInputRefs, DMS, Coordinate, DMSCoordinate, Direction } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-coordinate-input',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'both' },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'readonly', type: 'boolean', default: false },
        { name: 'placeholder', type: 'string', default: '' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'showDirection', type: 'boolean', default: false },
        { name: 'precision', type: 'number', default: 3 },
        { name: 'showDecimal', type: 'boolean', default: false },
        { name: 'autoTab', type: 'boolean', default: false },
        { name: 'latitudeDirectionOpen', type: 'boolean', default: false },
        { name: 'longitudeDirectionOpen', type: 'boolean', default: false },
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelyCoordinateInput extends BaseElement<CoordinateInputProps, CoordinateInputRefs> {
    /** 纬度 DMS 值 */
    #latitudeDms: DMS = { degrees: 0, minutes: 0, seconds: 0, direction: 'N' };
    /** 经度 DMS 值 */
    #longitudeDms: DMS = { degrees: 0, minutes: 0, seconds: 0, direction: 'E' };
    /** 聚焦状态 */
    #focused: { latitude: boolean; longitude: boolean } = { latitude: false, longitude: false };

    /** 外部点击关闭处理器引用 */
    #closeHandler: ((e: MouseEvent) => void) | null = null;

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.initializeValues();
    }

    /**
     * 组件卸载前
     */
    beforeUnmount(): void {
        if (this.#closeHandler) {
            document.removeEventListener('click', this.#closeHandler);
            this.#closeHandler = null;
        }
    }

    /**
     * 注册外部点击关闭事件
     */
    private registerCloseHandler(): void {
        // 先移除旧的处理器
        if (this.#closeHandler) {
            document.removeEventListener('click', this.#closeHandler);
        }

        // 创建新的处理器
        this.#closeHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // 如果点击的不是当前组件内的方向选择器，关闭下拉框
            if (!this.contains(target as Node) || !target.closest('.dms-input__direction')) {
                if (this.$data.latitudeDirectionOpen || this.$data.longitudeDirectionOpen) {
                    this.$data.latitudeDirectionOpen = false;
                    this.$data.longitudeDirectionOpen = false;
                    this.refresh();
                }
                // 关闭后移除监听器
                if (this.#closeHandler) {
                    document.removeEventListener('click', this.#closeHandler);
                    this.#closeHandler = null;
                }
            }
        };

        // 延迟添加监听器，避免当前点击事件立即触发
        setTimeout(() => {
            if (this.#closeHandler) {
                document.addEventListener('click', this.#closeHandler);
            }
        }, 0);
    }

    /**
     * 属性变化时
     */
    onPropChange(prop: string, value: unknown): void {
        if (prop === 'latitude' && typeof value === 'number') {
            this.#latitudeDms = this.decimalToDms(value, 'latitude');
            this.refresh();
            this.updateSecondsInputs();
        } else if (prop === 'longitude' && typeof value === 'number') {
            this.#longitudeDms = this.decimalToDms(value, 'longitude');
            this.refresh();
            this.updateSecondsInputs();
        }
    }

    /**
     * 初始化值
     */
    private initializeValues(): void {
        if (this.$data.latitude !== undefined && !isNaN(this.$data.latitude)) {
            this.#latitudeDms = this.decimalToDms(this.$data.latitude, 'latitude');
        }
        if (this.$data.longitude !== undefined && !isNaN(this.$data.longitude)) {
            this.#longitudeDms = this.decimalToDms(this.$data.longitude, 'longitude');
        }
        this.refresh();
        this.updateSecondsInputs();
    }

    /**
     * 更新秒输入框的显示值
     */
    private updateSecondsInputs(): void {
        const latitudeSecondsInput = this.$refs.latitudeSecondsInput as HTMLInputElement;
        const longitudeSecondsInput = this.$refs.longitudeSecondsInput as HTMLInputElement;

        if (latitudeSecondsInput) {
            const value = this.#latitudeDms.seconds;
            if (value > 0) {
                const precision = this.$data.precision ?? 3;
                if (value === Math.floor(value)) {
                    latitudeSecondsInput.value = String(Math.floor(value));
                } else {
                    latitudeSecondsInput.value = value.toFixed(precision);
                }
            } else {
                latitudeSecondsInput.value = '';
            }
        }

        if (longitudeSecondsInput) {
            const value = this.#longitudeDms.seconds;
            if (value > 0) {
                const precision = this.$data.precision ?? 3;
                if (value === Math.floor(value)) {
                    longitudeSecondsInput.value = String(Math.floor(value));
                } else {
                    longitudeSecondsInput.value = value.toFixed(precision);
                }
            } else {
                longitudeSecondsInput.value = '';
            }
        }
    }

    /**
     * 获取容器 class
     */
    getContainerClasses(): string {
        const classes: string[] = [];
        const size = this.$data.size || 'medium';
        const type = this.$data.type || 'both';

        // 尺寸映射
        if (size === 'small') {
            classes.push('coordinate-input--sm');
        } else if (size === 'large') {
            classes.push('coordinate-input--lg');
        } else {
            classes.push('coordinate-input--md');
        }
        if (type === 'both') {
            classes.push('coordinate-input--horizontal');
        }

        return classes.join(' ');
    }

    /**
     * 获取 DMS 输入框的 class
     */
    getDmsInputClasses(coordType: 'latitude' | 'longitude'): string {
        const classes: string[] = [];
        const isFocused = this.#focused[coordType];
        const isDisabled = this.$data.disabled;
        const isReadonly = this.$data.readonly;

        if (isFocused) classes.push('dms-input--focused');
        if (isDisabled) classes.push('dms-input--disabled');
        if (isReadonly) classes.push('dms-input--readonly');

        return classes.join(' ');
    }

    /**
     * 获取方向选择器的 class
     */
    getDirectionClasses(coordType: 'latitude' | 'longitude'): string {
        const classes: string[] = ['dms-input__direction'];
        const isOpen = coordType === 'latitude' ? this.$data.latitudeDirectionOpen : this.$data.longitudeDirectionOpen;

        if (isOpen) classes.push('dms-input__direction--open');

        return classes.join(' ');
    }

    /**
     * 获取方向选项的 class
     */
    getDirectionOptionClasses(coordType: 'latitude' | 'longitude', direction: string): string {
        const classes: string[] = ['dms-input__direction-option'];
        const currentDirection = coordType === 'latitude' ? this.#latitudeDms.direction : this.#longitudeDms.direction;

        if (currentDirection === direction) classes.push('dms-input__direction-option--selected');

        return classes.join(' ');
    }

    /**
     * 获取秒输入框的 placeholder
     * 根据 precision 参数动态生成
     */
    getSecondsPlaceholder(): string {
        const precision = this.$data.precision ?? 3;
        if (precision === 0) {
            return '00';
        }
        return '00.' + '0'.repeat(precision);
    }

    /**
     * 获取秒输入框的 step 属性
     */
    getSecondsStep(): string {
        const precision = this.$data.precision ?? 3;
        if (precision === 0) {
            return '1';
        }
        return '0.' + '0'.repeat(precision - 1) + '1';
    }

    /**
     * 获取 DMS 值用于显示
     */
    getDmsDisplayValue(coordType: 'latitude' | 'longitude', field: keyof DMS): string {
        const dms = coordType === 'latitude' ? this.#latitudeDms : this.#longitudeDms;
        const value = dms[field];

        if (field === 'seconds') {
            // 秒值根据 precision 参数保留小数位数，但0值显示为空
            const precision = this.$data.precision ?? 3;
            if (typeof value === 'number' && !isNaN(value) && value > 0) {
                // 如果是整数，不显示小数部分
                if (value === Math.floor(value)) {
                    return String(Math.floor(value));
                }
                return value.toFixed(precision);
            }
            return '';
        }
        if (field === 'direction') {
            return value as string;
        }

        return value !== undefined && value !== null && !isNaN(Number(value)) && Number(value) > 0 ? String(value) : '';
    }

    /**
     * 获取十进制显示值
     */
    getDecimalDisplayValue(coordType: 'latitude' | 'longitude'): string {
        const value = coordType === 'latitude' ? this.$data.latitude : this.$data.longitude;
        if (value === undefined || isNaN(value)) return '-';
        // 十进制显示使用6位小数（与秒精度分开）
        return value.toFixed(6);
    }

    /**
     * 处理 DMS 输入
     */
    handleDmsInput(
        coordType: 'latitude' | 'longitude',
        field: 'degrees' | 'minutes' | 'seconds',
        event: InputEvent,
    ): void {
        if (this.$data.disabled || this.$data.readonly) return;

        const target = event.target as HTMLInputElement;
        let value = parseFloat(target.value);

        // 验证输入范围
        const limits = this.getFieldLimits(coordType, field);
        if (isNaN(value)) {
            value = 0;
        } else if (value < limits.min) {
            value = limits.min;
        } else if (value > limits.max) {
            value = limits.max;
        }

        // 更新 DMS 值
        const dms = coordType === 'latitude' ? this.#latitudeDms : this.#longitudeDms;
        dms[field] = value;

        // 更新十进制值
        this.updateDecimalValue(coordType);

        // 自动跳转到下一个输入框
        if (this.$data.autoTab !== false && this.shouldAutoTab(field, value, limits.max)) {
            this.focusNextInput(coordType, field);
        }
    }

    /**
     * 处理度分秒输入框的 change 事件
     */
    handleDmsChange(
        _coordType: 'latitude' | 'longitude',
        _field: 'degrees' | 'minutes' | 'seconds',
        _event: Event,
    ): void {
        // change 事件由原生输入框触发，需要手动派发到组件外部
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 处理秒输入框的 change 事件
     */
    handleSecondsChange(coordType: 'latitude' | 'longitude', event: Event): void {
        const target = event.target as HTMLInputElement;
        let value = parseFloat(target.value);

        // 验证输入范围
        const limits = this.getFieldLimits(coordType, 'seconds');
        if (isNaN(value)) {
            value = 0;
        } else if (value < limits.min) {
            value = limits.min;
        } else if (value > limits.max) {
            value = limits.max;
        }

        // 根据精度格式化
        const precision = this.$data.precision ?? 3;
        value = parseFloat(value.toFixed(precision));

        // 更新 DMS 值
        const dms = coordType === 'latitude' ? this.#latitudeDms : this.#longitudeDms;
        dms.seconds = value;

        // 更新十进制值
        this.updateDecimalValue(coordType);

        this.refresh();
        this.updateSecondsInputs();

        // change 事件由原生输入框触发，需要手动派发到组件外部
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 判断是否满足自动跳转条件
     * 对于秒输入，需要根据精度参数判断是否包含小数点
     */
    private shouldAutoTab(field: 'degrees' | 'minutes' | 'seconds', value: number, max: number): boolean {
        // 度和分：当位数达到最大值位数时自动跳转
        if (field !== 'seconds') {
            const valueStr = String(Math.floor(value));
            const maxStr = String(Math.floor(max));
            return valueStr.length >= maxStr.length;
        }

        // 秒：根据精度参数判断是否跳转
        // 获取精度（默认3位小数）
        const precision = this.$data.precision ?? 3;

        // 将值转为字符串，检查小数位数
        const valueStr = String(value);
        const decimalIndex = valueStr.indexOf('.');

        // 如果没有小数点，且精度>0，不跳转（用户可能还要输入小数）
        if (decimalIndex === -1) {
            // 整数部分位数是否已达到最大值位数
            const intPart = Math.floor(value);
            const intStr = String(intPart);
            const maxStr = String(Math.floor(max));
            // 只有整数部分达到最大值位数，才允许跳转
            return intStr.length >= maxStr.length;
        }

        // 有小数点，检查小数位数是否达到精度
        const decimalPlaces = valueStr.length - decimalIndex - 1;
        return decimalPlaces >= precision;
    }

    /**
     * 聚焦到下一个输入框
     */
    private focusNextInput(coordType: 'latitude' | 'longitude', currentField: 'degrees' | 'minutes' | 'seconds'): void {
        const fieldMap: Record<string, string> = {
            degrees: 'Minutes',
            minutes: 'Seconds',
            seconds: 'Direction',
        };

        const nextField = fieldMap[currentField];
        if (!nextField) return;

        const refName = `${coordType}${nextField}Input`;
        const nextInput = this.$refs[refName] as HTMLInputElement | HTMLSelectElement;
        if (nextInput) {
            nextInput.focus();
            if (nextInput instanceof HTMLInputElement) {
                nextInput.select();
            }
        }
    }

    /**
     * 切换方向下拉框
     */
    toggleDirection(coordType: 'latitude' | 'longitude'): void {
        if (this.$data.disabled || this.$data.readonly) return;

        const key = coordType === 'latitude' ? 'latitudeDirectionOpen' : 'longitudeDirectionOpen';
        const isOpen = this.$data[key] || false;

        // 关闭另一个下拉框
        this.$data.latitudeDirectionOpen = false;
        this.$data.longitudeDirectionOpen = false;

        // 切换当前下拉框
        this.$data[key] = !isOpen;
        this.refresh();

        // 如果打开了下拉框，注册外部点击关闭事件
        if (this.$data[key]) {
            this.registerCloseHandler();
        }
    }

    /**
     * 处理下拉框点击（阻止冒泡到 toggleDirection）
     */
    handleDropdownClick(event: Event): void {
        event.stopPropagation();
    }

    /**
     * 选择方向
     */
    selectDirection(coordType: 'latitude' | 'longitude', direction: Direction): void {
        if (this.$data.disabled || this.$data.readonly) return;

        const dms = coordType === 'latitude' ? this.#latitudeDms : this.#longitudeDms;
        dms.direction = direction;

        // 关闭下拉框
        const key = coordType === 'latitude' ? 'latitudeDirectionOpen' : 'longitudeDirectionOpen';
        this.$data[key] = false;

        // 更新十进制值
        this.updateDecimalValue(coordType);
        this.refresh();
    }

    /**
     * 处理聚焦
     */
    handleFocus(coordType: 'latitude' | 'longitude', _event: FocusEvent): void {
        this.#focused[coordType] = true;
        this.refresh();
    }

    /**
     * 处理失焦
     */
    handleBlur(coordType: 'latitude' | 'longitude', _event: FocusEvent): void {
        this.#focused[coordType] = false;
        this.refresh();
    }

    /**
     * 处理秒输入框失焦
     */
    handleSecondsBlur(coordType: 'latitude' | 'longitude', event: FocusEvent): void {
        this.#focused[coordType] = false;

        const target = event.target as HTMLInputElement;
        let value = parseFloat(target.value);

        // 验证输入范围
        const limits = this.getFieldLimits(coordType, 'seconds');
        if (isNaN(value)) {
            value = 0;
        } else if (value < limits.min) {
            value = limits.min;
        } else if (value > limits.max) {
            value = limits.max;
        }

        // 根据精度格式化
        const precision = this.$data.precision ?? 3;
        value = parseFloat(value.toFixed(precision));

        // 更新 DMS 值
        const dms = coordType === 'latitude' ? this.#latitudeDms : this.#longitudeDms;
        dms.seconds = value;

        // 更新十进制值
        this.updateDecimalValue(coordType);

        this.refresh();
        this.updateSecondsInputs();
    }

    /**
     * 处理秒输入框键盘事件
     */
    handleSecondsKeyDown(_coordType: 'latitude' | 'longitude', event: KeyboardEvent): void {
        const target = event.target as HTMLInputElement;
        const precision = this.$data.precision ?? 3;
        const key = event.key;

        // 允许控制键
        if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape'].includes(key)) {
            // 控制键允许默认行为，事件自然传播
            return;
        }

        // 允许 Ctrl/Cmd + A/C/V/X
        if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(key.toLowerCase())) {
            return;
        }

        // 只允许数字和小数点
        if (!/[0-9.]/.test(key)) {
            event.preventDefault();
            return;
        }

        // 处理小数点
        if (key === '.') {
            // 如果已经有小数点，阻止再次输入
            if (target.value.includes('.')) {
                event.preventDefault();
                return;
            }
            // 如果精度为0，阻止输入小数点
            if (precision === 0) {
                event.preventDefault();
                return;
            }
            return;
        }

        // 检查数值范围（秒最大59）
        const currentValue = target.value;
        const selectionStart = target.selectionStart ?? 0;
        const selectionEnd = target.selectionEnd ?? 0;

        // 构造输入后的值
        const newValue = currentValue.slice(0, selectionStart) + key + currentValue.slice(selectionEnd);
        const numValue = parseFloat(newValue);

        // 如果输入后的值超过59，阻止输入
        if (!isNaN(numValue) && numValue > 59) {
            event.preventDefault();
            return;
        }

        // 检查小数位数限制
        const decimalIndex = currentValue.indexOf('.');
        if (decimalIndex !== -1 && selectionStart > decimalIndex) {
            const decimalPlaces = currentValue.length - decimalIndex - 1;
            // 如果已经达到精度限制，阻止数字输入
            if (decimalPlaces >= precision) {
                event.preventDefault();
                return;
            }
        }
    }

    /**
     * 获取字段的限制范围
     */
    private getFieldLimits(
        coordType: 'latitude' | 'longitude',
        field: 'degrees' | 'minutes' | 'seconds',
    ): { min: number; max: number } {
        const isLatitude = coordType === 'latitude';

        switch (field) {
            case 'degrees':
                return { min: 0, max: isLatitude ? 90 : 180 };
            case 'minutes':
            case 'seconds':
                return { min: 0, max: 59 };
            default:
                return { min: 0, max: 0 };
        }
    }

    /**
     * 更新十进制值
     */
    private updateDecimalValue(coordType: 'latitude' | 'longitude'): void {
        const dms = coordType === 'latitude' ? this.#latitudeDms : this.#longitudeDms;
        const decimal = this.dmsToDecimal(dms);

        if (coordType === 'latitude') {
            this.$data.latitude = decimal;
        } else {
            this.$data.longitude = decimal;
        }

        this.refresh();
    }

    /**
     * DMS 转十进制
     */
    private dmsToDecimal(dms: DMS): number {
        let decimal = dms.degrees + dms.minutes / 60 + dms.seconds / 3600;

        // 根据方向调整符号
        if (dms.direction === 'S' || dms.direction === 'W') {
            decimal = -decimal;
        }

        // 保留完整精度，不做截断，确保 DMS -> 十进制 -> DMS 可以还原
        return decimal;
    }

    /**
     * 十进制转 DMS
     */
    private decimalToDms(decimal: number, coordType: 'latitude' | 'longitude'): DMS {
        const isLatitude = coordType === 'latitude';
        let direction: Direction = isLatitude ? 'N' : 'E';

        // 处理负值
        if (decimal < 0) {
            decimal = -decimal;
            direction = isLatitude ? 'S' : 'W';
        }

        const degrees = Math.floor(decimal);
        const minutesDecimal = (decimal - degrees) * 60;
        const minutes = Math.floor(minutesDecimal);
        const seconds = parseFloat(((minutesDecimal - minutes) * 60).toFixed(3));

        return { degrees, minutes, seconds, direction };
    }

    /**
     * 获取坐标值（十进制）
     */
    getValue(): Coordinate {
        return {
            latitude: this.$data.latitude || 0,
            longitude: this.$data.longitude || 0,
        };
    }

    /**
     * 获取 DMS 格式的坐标值
     */
    getDmsCoordinateValue(): DMSCoordinate {
        return {
            latitude: { ...this.#latitudeDms },
            longitude: { ...this.#longitudeDms },
        };
    }

    /**
     * 设置坐标值（十进制）
     */
    setValue(latitude: number, longitude: number): void {
        this.$data.latitude = latitude;
        this.$data.longitude = longitude;
        this.#latitudeDms = this.decimalToDms(latitude, 'latitude');
        this.#longitudeDms = this.decimalToDms(longitude, 'longitude');
        this.refresh();
    }

    /**
     * 清空值
     */
    clear(): void {
        this.$data.latitude = 0;
        this.$data.longitude = 0;
        this.#latitudeDms = { degrees: 0, minutes: 0, seconds: 0, direction: 'N' };
        this.#longitudeDms = { degrees: 0, minutes: 0, seconds: 0, direction: 'E' };
        this.refresh();

        // 派发原生 clear 事件
        this.dispatchEvent(
            new Event('clear', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * value 属性 getter
     * 返回坐标值对象 { latitude, longitude }
     */
    get value(): Coordinate {
        return this.getValue();
    }

    /**
     * value 属性 setter
     * 接受坐标值对象 { latitude, longitude } 或 [latitude, longitude]
     */
    set value(val: Coordinate | [number, number]) {
        if (Array.isArray(val)) {
            this.setValue(val[0], val[1]);
        } else {
            this.setValue(val.latitude, val.longitude);
        }
    }
}

export default SolelyCoordinateInput;
export { SolelyCoordinateInput };
