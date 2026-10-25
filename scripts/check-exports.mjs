#!/usr/bin/env node
/**
 * 发布产物自检：校验 package.json 的 exports 中每个入口在 dist 下真实存在。
 *
 * 背景：`npm pack` 不会触发 prepublishOnly，若 dist 陈旧（例如新增了子路径入口
 * 但没重新构建），打出的 tarball 会缺失入口，用户 import 时直接 ERR_MODULE_NOT_FOUND。
 *
 * 用法：node scripts/check-exports.mjs [--dist <目录>]
 *   --dist 可指定替代产物目录（默认 dist），用于验证临时构建结果
 * 退出码：0 全部存在；1 存在缺失（打印缺失清单）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const distArgIndex = process.argv.indexOf('--dist');
const distDir = distArgIndex !== -1 && process.argv[distArgIndex + 1] ? process.argv[distArgIndex + 1] : 'dist';

/** 把 exports 中的 dist/ 前缀替换为实际产物目录 */
function toActual(target) {
    return distDir === 'dist' ? target : target.replace(/^dist\//, `${distDir.replace(/\/$/, '')}/`);
}

/** 产物路径 -> 对应的源码路径（用于区分「漏构建」和「本就不是模块」） */
function sourceOf(target) {
    return target
        .replace(/^dist\//, 'src/')
        .replace(/\.d\.ts$/, '.ts')
        .replace(/\.(js|cjs)$/, '.ts');
}

/** 展开通配入口：dist/components/elements/<name>/index.js -> 每个子目录一份（返回声明形式路径） */
function expandTarget(target) {
    if (!target.includes('*')) return [target];

    const [prefix, suffix] = target.split('*');
    const dir = path.join(root, toActual(prefix));
    if (!fs.existsSync(dir)) return [];

    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => `${prefix}${entry.name}${suffix}`);
}

const missing = [];
const checked = new Set();
const skipped = [];

function checkTarget(target, trail) {
    if (!target.includes('*')) {
        if (fs.existsSync(path.join(root, toActual(target)))) {
            checked.add(target);
        } else {
            missing.push(`${trail} -> ${target}`);
        }
        return;
    }

    const expanded = expandTarget(target);
    if (expanded.length === 0) {
        missing.push(`${trail} -> ${target}（通配目录不存在）`);
        return;
    }

    for (const item of expanded) {
        if (fs.existsSync(path.join(root, toActual(item)))) {
            checked.add(item);
        } else if (fs.existsSync(path.join(root, sourceOf(item)))) {
            // 源码存在但产物缺失 => 漏构建
            missing.push(`${trail} -> ${item}（源码存在，产物缺失）`);
        } else {
            // 源码也不存在：不是可导入模块（如 components/elements/utils）
            skipped.push(item);
        }
    }
}

function walk(node, trail) {
    for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string') {
            checkTarget(value.replace(/^\.\//, ''), `${trail}${key}`);
        } else if (value && typeof value === 'object') {
            walk(value, `${trail}${key} `);
        }
    }
}

if (!pkg.exports || typeof pkg.exports !== 'object') {
    console.error('[check-exports] package.json 缺少 exports 字段');
    process.exit(1);
}

walk(pkg.exports, '');

if (missing.length > 0) {
    console.error(`[check-exports] ❌ 有 ${missing.length} 个导出目标缺失：\n`);
    for (const item of missing) console.error(`  - ${item}`);
    console.error('\n请先执行 `npm run build` 重新生成 dist 后再打包/发布。');
    process.exit(1);
}

console.log(
    `[check-exports] ✅ ${checked.size} 个导出目标全部存在${skipped.length ? `（跳过 ${skipped.length} 个非模块项）` : ''}`,
);
