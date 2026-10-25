/**
 * 终极 HTML 实体解码工具 (Template Engine 专用)
 * 1. 跨平台：无 DOM 依赖，支持 Node.js / Browser / Worker / 小程序
 * 2. 兼容性：支持命名实体、数字实体 (10/16进制)、Windows-1252 特殊映射
 * 3. 安全性：严格校验 Unicode 码点范围，防止非法字符注入
 * 4. 性能：针对模板引擎优化，包含快速路径判断
 */

/**
 * 常用命名实体表（HTML4 常用符号 + 拉丁标点）
 * 说明：不是完整 WHATWG 实体表（2000+ 项），只收录实际模板中常见的符号；
 * 未收录的实体会原样保留，不会误删内容。
 */
const NAMED_ENTITIES: Record<string, string> = {
    // 基础
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    // 空白与连接
    nbsp: '\u00A0',
    ensp: '\u2002',
    emsp: '\u2003',
    thinsp: '\u2009',
    shy: '\u00AD',
    zwj: '\u200D',
    zwnj: '\u200C',
    // 标点
    hellip: '…',
    middot: '·',
    bull: '•',
    ndash: '–',
    mdash: '—',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    laquo: '«',
    raquo: '»',
    lsaquo: '‹',
    rsaquo: '›',
    dagger: '†',
    Dagger: '‡',
    prime: '′',
    Prime: '″',
    permil: '‰',
    // 货币与符号
    cent: '¢',
    pound: '£',
    yen: '¥',
    euro: '€',
    curren: '¤',
    copy: '©',
    reg: '®',
    trade: '™',
    deg: '°',
    plusmn: '±',
    times: '×',
    divide: '÷',
    frac12: '½',
    frac14: '¼',
    frac34: '¾',
    sup1: '¹',
    sup2: '²',
    sup3: '³',
    micro: 'µ',
    para: '¶',
    sect: '§',
    iexcl: '¡',
    iquest: '¿',
    // 数学
    minus: '−',
    le: '≤',
    ge: '≥',
    ne: '≠',
    asymp: '≈',
    equiv: '≡',
    infin: '∞',
    sum: '∑',
    radic: '√',
    // 箭头
    larr: '←',
    uarr: '↑',
    rarr: '→',
    darr: '↓',
    harr: '↔',
};

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

const ENTITY_REGEX = /&(?:#([xX][0-9a-fA-F]+|\d+)|([a-zA-Z0-9]+));/g;

export default function htmlDecode(str: string): string {
    if (!str || typeof str !== 'string' || !str.includes('&')) {
        return str;
    }

    return str.replace(ENTITY_REGEX, (match, numEntity, nameEntity) => {
        if (nameEntity) {
            // 先精确匹配（&Dagger; 与 &dagger; 是两个不同实体），再回退小写匹配。
            // 必须用 hasOwnProperty：直接下标会命中原型链（&toString; 会输出 native code）
            if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, nameEntity)) {
                return NAMED_ENTITIES[nameEntity];
            }
            const lower = nameEntity.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) {
                return NAMED_ENTITIES[lower];
            }
            return match;
        }

        if (numEntity) {
            const isHex = numEntity[0] === 'x' || numEntity[0] === 'X';
            let code = parseInt(isHex ? numEntity.slice(1) : numEntity, isHex ? 16 : 10);

            if (isNaN(code)) return match;

            if (code >= 128 && code <= 159) {
                code = WIN1252_MAP[code] || code;
            }

            if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) {
                return '\uFFFD';
            }

            return String.fromCodePoint(code);
        }

        return match;
    });
}
