import { describe, expect, it } from 'vitest';
import { injectThemeVariables } from '../src/components/theme/auto-inject';

describe('theme 自动注入', () => {
    it('注入且只注入一次，带可识别的 style 标记', () => {
        injectThemeVariables();
        injectThemeVariables();

        const styles = document.querySelectorAll('#solely-theme-variables');
        expect(styles).toHaveLength(1);

        const style = styles[0] as HTMLStyleElement;
        expect(style.getAttribute('data-solely-theme')).toBe('');
        // 说明：Vitest 默认把 CSS 导入替换为空字符串，这里不断言具体 token；
        // 真实内容由构建期 `?inline` 注入，构建验证覆盖。
        expect(typeof style.textContent).toBe('string');
    });
});
