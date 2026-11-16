#!/usr/bin/env node
/**
 * F-8：校验 dist 的构建指纹是否仍与当前 src 一致，发现"忘了重建"就非零退出。
 *
 * 背景：dist 被 gitignore，git 不会提示它与源码不同步；check:exports 只校验入口
 * "存在"，不校验内容。`npm pack` 不触发 prepublishOnly，因此本地打包 / file: 引用 /
 * npm link 会拿到旧产物且毫无信号。
 *
 * 用法：
 *   node scripts/check-dist-fresh.mjs [--dist <目录>] [--skip] [--reason <原因>]
 *
 *   --dist     替代产物目录（默认取 SOLELY_BUILD_OUT_DIR，否则 dist）
 *   --skip     显式跳过（等同设置 SOLELY_SKIP_DIST_FRESH）
 *   --reason   跳过原因，会打印在输出里
 *
 * 退出码：0 一致或显式跳过；1 落后 / 缺少指纹 / 读取失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashSourceTree, META_FILE } from './dist-freshness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
let distArg = null;
let skip = false;
let reason = null;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dist') {
        distArg = args[++i] ?? null;
        if (!distArg) usage('--dist 需要一个目录参数');
    } else if (arg === '--skip') {
        skip = true;
    } else if (arg === '--reason') {
        reason = args[++i] ?? null;
        if (!reason) usage('--reason 需要一个原因字符串');
    } else if (arg === '--help' || arg === '-h') {
        usage();
    } else {
        usage(`未知参数：${arg}`);
    }
}

const envSkip = process.env.SOLELY_SKIP_DIST_FRESH;
if (envSkip && !skip) {
    skip = true;
    if (!reason && envSkip !== '1' && !/^(true|yes)$/i.test(envSkip)) reason = envSkip;
}

const distDir = path.resolve(root, distArg || process.env.SOLELY_BUILD_OUT_DIR || 'dist');
const distLabel = path.relative(root, distDir) || '.';

if (skip) {
    console.log(
        `[check-dist-fresh] ⏭  显式跳过：未比较 ${distLabel} 与 src（原因：${reason || '未说明'}）。\n` +
            '                  这是有意不重建产物的选择，请自行确认发布/联调前 dist 足够新。',
    );
    process.exit(0);
}

const metaPath = path.join(distDir, META_FILE);

if (!fs.existsSync(distDir)) {
    console.error(
        `[check-dist-fresh] ❌ 产物目录 ${distLabel} 不存在，无法校验。\n` +
            '                  请先执行 `npm run build` 生成 dist。',
    );
    process.exit(1);
}

let meta;
try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
} catch (error) {
    if (error.code === 'ENOENT') {
        failWithoutMeta();
    }
    console.error(`[check-dist-fresh] ❌ 无法读取 ${distLabel}/${META_FILE}：${error.message}`);
    process.exit(1);
}

let current;
try {
    current = hashSourceTree(root);
} catch (error) {
    console.error(`[check-dist-fresh] ❌ 计算源码指纹失败：${error.message}`);
    process.exit(1);
}

const problems = [];

if (meta.version !== pkg.version) {
    problems.push(`版本不一致：package.json 为 ${pkg.version}，构建指纹为 ${meta.version}`);
}

const recordedFiles = meta.files && typeof meta.files === 'object' ? meta.files : null;
const added = [];
const changed = [];
const deleted = [];

if (recordedFiles) {
    for (const rel of Object.keys(current.files)) {
        if (!(rel in recordedFiles)) added.push(rel);
        else if (recordedFiles[rel] !== current.files[rel]) changed.push(rel);
    }
    for (const rel of Object.keys(recordedFiles)) {
        if (!(rel in current.files)) deleted.push(rel);
    }
} else if (meta.sourceHash !== current.sourceHash) {
    problems.push('构建指纹与当前源码不一致，且指纹缺少逐文件明细，无法列出差异文件');
}

if (meta.sourceHash !== current.sourceHash) {
    const diffCount = added.length + changed.length + deleted.length;
    if (diffCount > 0) {
        problems.push(`源码自构建后发生变化：${diffCount} 个文件（新增 ${added.length} / 修改 ${changed.length} / 删除 ${deleted.length}）`);
    } else if (recordedFiles) {
        problems.push('总指纹不一致，但逐文件摘要未发现差异（指纹可能由不同算法/版本生成）');
    }
}

if (problems.length === 0) {
    console.log(
        `[check-dist-fresh] ✅ ${distLabel} 与 src 一致（${current.fileCount} 个构建输入，` +
            `构建于 ${formatTime(meta.builtAt)}${meta.gitSha ? `，git ${meta.gitSha.slice(0, 7)}` : ''}）。`,
    );
    printGitNote(meta);
    process.exit(0);
}

console.error(`[check-dist-fresh] ❌ ${distLabel} 落后于 src：`);
console.error(
    `  构建指纹：version ${meta.version ?? '未知'}${meta.gitSha ? `，git ${meta.gitSha.slice(0, 7)}` : ''}，` +
        `构建于 ${formatTime(meta.builtAt)}${formatAge(meta.builtAt)}`,
);
console.error(`  源码现状：${current.fileCount} 个构建输入`);

for (const problem of problems) console.error(`  - ${problem}`);

printList('修改（产物未包含这些改动）', changed);
printList('新增（构建后才加入源码）', added);
printList('删除（构建后才从源码移除）', deleted);

console.error(
    '\n  处理方式：\n' +
        '    1) 执行 `npm run build` 重建 dist（推荐，构建会自动写入新的 build-meta.json）；\n' +
        '    2) 若确实要沿用旧产物（例如仅调试历史版本），显式跳过并说明原因：\n' +
        '         npm run check:dist-fresh -- --skip --reason "调试旧版本产物"\n' +
        '       或设置环境变量 SOLELY_SKIP_DIST_FRESH="调试旧版本产物"',
);
console.error('  注意：mtime 不能作为判定依据（checkout / 复制会让 mtime 整体失真），本检查只认内容指纹。');
process.exit(1);

function usage(message) {
    if (message) console.error(`[check-dist-fresh] ${message}\n`);
    console.error(
        '用法：node scripts/check-dist-fresh.mjs [--dist <目录>] [--skip] [--reason <原因>]\n' +
            '  --dist    替代产物目录（默认 SOLELY_BUILD_OUT_DIR 或 dist）\n' +
            '  --skip    显式跳过校验（等同 SOLELY_SKIP_DIST_FRESH）\n' +
            '  --reason  跳过原因',
    );
    process.exit(message ? 2 : 0);
}

function failWithoutMeta() {
    const artifactFiles = listFiles(distDir);
    const newest = artifactFiles.reduce((latest, file) => {
        const mtime = fs.statSync(file).mtimeMs;
        return mtime > latest ? mtime : latest;
    }, 0);

    let hint = '';
    if (newest) {
        const { paths } = hashSourceTree(root);
        const newerSources = paths.filter(rel => fs.statSync(path.join(root, rel)).mtimeMs > newest);
        hint =
            `  粗判（mtime，仅作提示）：${paths.length} 个构建输入中有 ${newerSources.length} 个比 ${distLabel} 内最新产物还新。\n` +
            '                  该提示跨 checkout / 复制会失真，不能作为放行依据。\n';
    }

    console.error(
        `[check-dist-fresh] ❌ ${distLabel} 缺少构建指纹（${distLabel}/${META_FILE}）。\n` +
            '                  该文件由 `npm run build` 自动写入；缺失说明这是旧构建产物或从未构建，\n' +
            '                  无法证明与 src 一致。\n' +
            hint +
            '\n  处理方式：执行 `npm run build` 重建；若确实要沿用旧产物，显式跳过并说明原因：\n' +
            '            npm run check:dist-fresh -- --skip --reason "沿用旧版本产物"\n' +
            '            或设置 SOLELY_SKIP_DIST_FRESH="沿用旧版本产物"',
    );
    process.exit(1);
}

function listFiles(dir) {
    const out = [];
    const walk = abs => {
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            const full = path.join(abs, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) out.push(full);
        }
    };
    walk(dir);
    return out;
}

function printList(title, files) {
    if (files.length === 0) return;
    console.error(`  ${title}：`);
    const limit = 20;
    for (const rel of files.slice(0, limit)) console.error(`    - ${rel}`);
    if (files.length > limit) console.error(`    … 另有 ${files.length - limit} 个未列出`);
}

function printGitNote(meta) {
    if (!meta.gitSha) return;
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const currentSha = head.status === 0 ? head.stdout.trim() : null;
    if (currentSha && currentSha !== meta.gitSha) {
        console.log(
            `  ℹ️  产物构建于 git ${meta.gitSha.slice(0, 7)}，当前 HEAD 为 ${currentSha.slice(0, 7)}；` +
                '源码内容指纹一致，可能是同一内容的重新提交（gitSha 仅记录，不参与判定）。',
        );
    }
}

function formatTime(iso) {
    if (!iso) return '未知时间';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '未知时间';
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatAge(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return '（刚刚）';
    if (minutes < 60) return `（${minutes} 分钟前）`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `（${hours} 小时前）`;
    return `（${Math.round(hours / 24)} 天前）`;
}
