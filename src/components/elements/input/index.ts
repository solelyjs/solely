/**
 * Solely Input 组件
 * 基础输入框组件，支持多种类型和状态
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { InputProps, InputRefs } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-input',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'text' },
        { name: 'size', type: 'string', default: '' },
        { name: 'value', type: 'string', default: '' },
        { name: 'placeholder', type: 'string', default: '' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'readonly', type: 'boolean', default: false },
        { name: 'required', type: 'boolean', default: false },
        { name: 'maxlength', type: 'number' },
        { name: 'minlength', type: 'number' },
        { name: 'clearable', type: 'boolean', default: false },
        { name: 'showpassword', type: 'boolean', default: false },
        { name: 'passwordVisible', type: 'boolean', default: false },
        { name: 'focused', type: 'boolean', default: false },
        { name: 'prefix', type: 'string', default: '' },
        { name: 'suffix', type: 'string', default: '' },
        { name: 'status', type: 'string', default: '' },
        { name: 'message', type: 'string', default: '' },
        { name: 'showcount', type: 'boolean', default: false },
        { name: 'rows', type: 'number', default: 3 },
        { name: 'autofocus', type: 'boolean', default: false },
        { name: 'selectall', type: 'boolean', default: false },
        { name: 'copyable', type: 'boolean', default: false },
        { name: 'format', type: 'string', default: 'none' },
        { name: 'suggestions', type: 'array', default: [] },
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelyInput extends BaseElement<InputProps, InputRefs> {
    /** 过滤后的搜索建议 */
    private _filteredSuggestions: string[] = [];
    /** 缓存输入框 DOM 引用 */
    private inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
    /** 搜索防抖定时器 */
    private searchDebounceTimer?: number;

    /**
     * 获取过滤后的搜索建议（供模板使用）
     */
    get filteredSuggestions(): string[] {
        return this._filteredSuggestions;
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        // 自动聚焦
        if (this.$data.autofocus) {
            this.focus();
        }
    }

    /**
     * 检查是否有 prefix 插槽
     */
    hasPrefixSlot(): boolean {
        return this.querySelector('[slot="prefix"]') !== null;
    }

    /**
     * 检查是否有 suffix 插槽
     */
    hasSuffixSlot(): boolean {
        return this.querySelector('[slot="suffix"]') !== null;
    }

    protected afterMount(): void {
        // 缓存输入框 DOM 引用
        this.inputElement = this.shadowRoot?.querySelector('input, textarea') as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null;
    }

    /**
     * 获取 wrapper class 对象
     */
    getWrapperClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['form-control--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['form-control--lg'] = true;
        }
        // 状态映射
        if (this.$data.status === 'error') {
            classes['is-error'] = true;
        } else if (this.$data.status === 'warning') {
            classes['is-warning'] = true;
        } else if (this.$data.status === 'success') {
            classes['is-success'] = true;
        }
        if (this.$data.type === 'textarea') {
            classes['form-control--textarea'] = true;
        }
        classes['is-focused'] = !!this.$data.focused;
        classes['is-disabled'] = !!this.$data.disabled;
        classes['is-readonly'] = !!this.$data.readonly;
        classes['form-control--block'] = !!this.$data.block;
        return classes;
    }

    /**
     * 获取当前字符数
     */
    getCharCount(): number {
        return this.$data.value?.length || 0;
    }

    /**
     * 格式化输入值
     */
    formatValue(value: string): string {
        if (!value) return '';
        switch (this.$data.format) {
            case 'phone':
                // 手机号：138 1234 5678（3-4-4格式）
                return value.replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3').trim();
            case 'bankcard':
                // 银行卡：1234 5678 9012 3456
                return value.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
            case 'idcard':
                // 身份证：123456 7890 1234 5678 90
                return value.replace(/(\d{6})(\d{4})(\d{4})(\d{4})(\d{0,4})/, '$1 $2 $3 $4 $5').trim();
            default:
                return value;
        }
    }

    /**
     * 反格式化（去除空格）
     */
    unformatValue(value: string): string {
        if (!value) return '';
        return value.replace(/\s/g, '');
    }

    /**
     * 输入事件处理
     */
    handleInput(event: InputEvent): void {
        const target = event.target as HTMLInputElement;
        let value = target.value;

        // 处理格式化
        if (this.$data.format !== 'none' && this.$data.type !== 'textarea') {
            const unformatted = this.unformatValue(value);
            const formatted = this.formatValue(unformatted);
            // 只有在值真正改变时才更新，避免循环触发 input
            if (formatted !== value) {
                target.value = formatted;
                value = formatted;
            }
        }

        this.$data.value = value;

        // 更新搜索建议
        if (this.$data.suggestions && this.$data.suggestions.length > 0) {
            this.updateSuggestions(value);
        }

        // input 是原生事件，不需要 emit
    }

    /**
     * 聚焦事件处理
     */
    handleFocus(_event: FocusEvent): void {
        this.$data.focused = true;

        // 聚焦时全选
        if (this.$data.selectall && this.$data.value) {
            this.select();
        }

        // focus 是原生事件，不需要 emit
    }

    /**
     * 失焦事件处理
     */
    handleBlur(_event: FocusEvent): void {
        this.$data.focused = false;
        // blur 是原生事件，不需要 emit
    }

    /**
     * 值改变事件处理（失焦或回车时触发）
     */
    handleChange(_event: Event): void {
        // change 是原生事件，需要手动派发到组件外部
        // 因为 Shadow DOM 会阻止事件自然冒泡
        // 外部可以通过 event.target.value 获取值
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 键盘事件处理
     */
    handleKeydown(event: KeyboardEvent): void {
        // keydown 是原生事件，不需要 emit

        // 回车触发搜索（search 是自定义事件）
        if (event.key === 'Enter' && this.$data.type === 'search') {
            this.emit('search', {
                value: this.$data.value,
            });
        }
    }

    /**
     * 清除输入
     */
    handleClear(): void {
        this.$data.value = '';

        // 派发原生 clear 事件
        this.dispatchEvent(
            new Event('clear', {
                bubbles: true,
                composed: true,
            }),
        );

        // 聚焦输入框
        this.focus();
    }

    /**
     * 切换密码显示
     */
    togglePassword(): void {
        this.$data.passwordVisible = !this.$data.passwordVisible;
    }

    /**
     * 复制内容
     */
    async handleCopy(): Promise<void> {
        try {
            const value = this.unformatValue(this.$data.value);
            await navigator.clipboard.writeText(value);
            this.emit('copy', { value });
        } catch (err) {
            this.emit('copy-error', { error: err });
        }
    }

    /**
     * 更新搜索建议（带防抖）
     */
    updateSuggestions(value: string): void {
        // 清除之前的定时器
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        // 防抖 300ms
        this.searchDebounceTimer = setTimeout(() => {
            this._updateSuggestionsImpl(value);
            this.searchDebounceTimer = undefined;
        }, 300) as unknown as number;
    }

    /**
     * 实际更新搜索建议的实现
     */
    private _updateSuggestionsImpl(value: string): void {
        if (!value || !this.$data.suggestions) {
            this._filteredSuggestions = [];
            this.refresh();
            return;
        }
        this._filteredSuggestions = this.$data.suggestions.filter(item =>
            item.toLowerCase().includes(value.toLowerCase()),
        );
        this.refresh();
    }

    /**
     * 选择建议
     */
    selectSuggestion(suggestion: string): void {
        this.$data.value = suggestion;
        this._filteredSuggestions = [];
        this.refresh();
        // input 是原生事件，不需要手动派发
        // change 需要手动派发到组件外部
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 聚焦输入框
     */
    public focus(): void {
        this.inputElement?.focus();
        this.$data.focused = true;
    }

    /**
     * 失焦输入框
     */
    public blur(): void {
        this.inputElement?.blur();
        this.$data.focused = false;
    }

    /**
     * 设置值
     */
    public setValue(value: string): void {
        this.$data.value = value;
    }

    /**
     * 获取值
     */
    public getValue(): string {
        return this.unformatValue(this.$data.value);
    }

    /**
     * value 属性 getter
     */
    get value(): string {
        return this.getValue();
    }

    /**
     * value 属性 setter
     */
    set value(val: string) {
        this.setValue(val);
    }

    /**
     * 选择文本
     */
    public select(): void {
        this.inputElement?.select();
    }
}

export default SolelyInput;
export { SolelyInput };
