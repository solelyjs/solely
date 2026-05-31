/**
 * 终极 HTML 实体解码工具 (Template Engine 专用)
 * 1. 跨平台：无 DOM 依赖，支持 Node.js / Browser / Worker / 小程序
 * 2. 兼容性：支持命名实体、数字实体 (10/16进制)、Windows-1252 特殊映射
 * 3. 安全性：严格校验 Unicode 码点范围，防止非法字符注入
 * 4. 性能：针对模板引擎优化，包含快速路径判断
 */

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
            return NAMED_ENTITIES[nameEntity.toLowerCase()] || match;
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
