/**
 * 终极 HTML 实体解码工具 (Template Engine 专用)
 * 1. 跨平台：无 DOM 依赖，支持 Node.js / Browser / Worker / 小程序
 * 2. 兼容性：支持命名实体、数字实体 (10/16进制)、Windows-1252 特殊映射
 * 3. 安全性：严格校验 Unicode 码点范围，防止非法字符注入
 * 4. 性能：针对模板引擎优化，包含快速路径判断
 */
const htmlDecode = (() => {
    // 1. 核心命名实体映射 (模板引擎中最常见的实体)
    const NAMED_ENTITIES: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
        copy: '©',
        reg: '®',
        trade: '™',
        hellip: '…',
        middot: '·',
        euro: '€',
    };

    // 2. Windows-1252 映射表 (解决浏览器将 &#128; - &#159; 解析为特殊符号的怪癖)
    const WIN1252_MAP: Record<number, number> = {
        128: 0x20ac,
        130: 0x201a,
        131: 0x0192,
        132: 0x201e,
        133: 0x2026,
        134: 0x2020,
        135: 0x2021,
        136: 0x02c6,
        137: 0x2030,
        138: 0x0160,
        139: 0x2039,
        140: 0x0152,
        142: 0x017d,
        145: 0x2018,
        146: 0x2019,
        147: 0x201c,
        148: 0x201d,
        149: 0x2022,
        150: 0x2013,
        151: 0x2014,
        152: 0x02dc,
        153: 0x2122,
        154: 0x0161,
        155: 0x203a,
        156: 0x0153,
        158: 0x017e,
        159: 0x0178,
    };

    // 3. 预编译正则：匹配 &...; 结构
    // 分组 1: 数字实体内容 (如 #123 或 #x123)
    // 分组 2: 命名实体内容 (如 amp)
    const ENTITY_REGEX = /&(?:#([xX][0-9a-fA-F]+|\d+)|([a-zA-Z0-9]+));/g;

    return function htmlDecode(str: string): string {
        // 快速路径：如果不包含 &，直接返回，避免正则开销
        if (!str || typeof str !== 'string' || !str.includes('&')) {
            return str;
        }

        return str.replace(ENTITY_REGEX, (match, numEntity, nameEntity) => {
            // --- 处理命名实体 ---
            if (nameEntity) {
                // 模板引擎通常对大小写敏感，按 HTML5 标准这里匹配小写
                return NAMED_ENTITIES[nameEntity.toLowerCase()] || match;
            }

            // --- 处理数字实体 ---
            if (numEntity) {
                const isHex = numEntity[0] === 'x' || numEntity[0] === 'X';
                let code = parseInt(isHex ? numEntity.slice(1) : numEntity, isHex ? 16 : 10);

                // 容错：解析失败返回原样
                if (isNaN(code)) return match;

                // 修正 Windows-1252 映射 (浏览器解析遗留问题)
                if (code >= 128 && code <= 159) {
                    code = WIN1252_MAP[code] || code;
                }

                // 码点合法性校验
                // 避开 0x00, 0xD800-0xDFFF (代理对), 以及超过 Unicode 最大值的码点
                if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) {
                    return '\uFFFD'; // 替换为 Unicode 官方错误占位符
                }

                return String.fromCodePoint(code);
            }

            return match;
        });
    };
})();

export default htmlDecode;
