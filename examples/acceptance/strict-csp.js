import '../../src/components/index';

const LINK_ID = 'manual-theme-link';
const THEME_STYLE_ID = 'solely-theme-variables';
const byId = id => document.getElementById(id);

function report() {
    const link = byId(LINK_ID);
    const styleNode = byId(THEME_STYLE_ID);
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--solely-primary').trim();
    const lines = [
        "CSP: style-src 'self'（无 'unsafe-inline'）",
        `自动注入的 <style id="${THEME_STYLE_ID}"> 节点 = ${styleNode ? '存在（但内联样式被拦）' : '不存在'}`,
        `手动 <link> = ${link ? '存在' : '已移除'}`,
        `--solely-primary 计算值 = ${primary || '(空)'}`,
        '',
        primary
            ? '✅ 主题变量可用：手动引入 variables.css 已生效'
            : '❌ 主题变量为空：自动注入被 CSP 拦截，必须手动引入 variables.css',
        '提示：DevTools Console 应出现 [Solely Theme] 主题变量未能生效 的警告。',
    ];
    byId('csp-out').textContent = lines.join('\n');
}

byId('btn-remove-link').addEventListener('click', () => {
    const link = byId(LINK_ID);
    if (link) link.remove();
    setTimeout(report, 100);
});

byId('btn-restore-link').addEventListener('click', () => {
    if (!byId(LINK_ID)) {
        const link = document.createElement('link');
        link.id = LINK_ID;
        link.rel = 'stylesheet';
        link.href = '/src/components/theme/variables.css';
        document.head.appendChild(link);
    }
    setTimeout(report, 300);
});

byId('btn-report').addEventListener('click', report);
window.addEventListener('load', () => setTimeout(report, 150));
report();
