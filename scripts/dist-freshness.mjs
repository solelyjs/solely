/**
 * F-8 共用能力：计算构建输入（源码 + 构建配置）的内容指纹、读写 dist/build-meta.json。
 *
 * 为什么用内容指纹而不是 mtime：
 *   mtime 在 git checkout / 复制 / 解压 tarball / 云盘同步后会整体刷新，既可能把旧产物
 *   判成"新"，也可能把新源码判成"旧"；内容哈希只随字节变化，跨机器、跨 checkout 稳定。
 *
 * 指纹覆盖范围：src/ 下全部文件 + 构建配置（vite.config.ts）。依赖版本、tsconfig.json
 * 等未纳入，属于已知局限（见 check-dist-fresh.mjs 输出说明）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SRC_DIR = 'src';
const EXTRA_BUILD_INPUTS = ['vite.config.ts'];
export const META_FILE = 'build-meta.json';
export const META_SCHEMA_VERSION = 1;

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function collectFiles(absDir, relBase, out) {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

        const abs = path.join(absDir, entry.name);
        const rel = `${relBase}/${entry.name}`;

        if (entry.isDirectory()) collectFiles(abs, rel, out);
        else if (entry.isFile()) out.push(rel);
    }
}

/**
 * 计算当前工作区构建输入的内容指纹。
 * @returns {{ files: Record<string, string>, sourceHash: string, fileCount: number, paths: string[] }}
 */
export function hashSourceTree(root) {
    const srcAbs = path.join(root, SRC_DIR);
    if (!fs.existsSync(srcAbs)) {
        throw new Error(`找不到源码目录：${srcAbs}`);
    }

    const rels = [];
    collectFiles(srcAbs, SRC_DIR, rels);

    for (const extra of EXTRA_BUILD_INPUTS) {
        if (fs.existsSync(path.join(root, extra))) rels.push(extra);
    }

    rels.sort();

    const files = {};
    const digestLines = [];

    for (const rel of rels) {
        const digest = sha256(fs.readFileSync(path.join(root, rel)));
        // 逐文件摘要取前 16 位：足够区分内容，又能把 build-meta.json 维持在十几 KB
        files[rel] = digest.slice(0, 16);
        digestLines.push(`${rel}\0${digest}`);
    }

    return {
        files,
        sourceHash: sha256(Buffer.from(digestLines.join('\n'))),
        fileCount: rels.length,
        paths: rels,
    };
}

/** 读取 git 状态；不在 git 仓库或没有 git 时返回 null 字段，不影响校验结论。 */
export function gitInfo(root) {
    const run = args => {
        const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
        return result.status === 0 ? result.stdout.trim() : null;
    };

    const gitSha = run(['rev-parse', 'HEAD']);
    if (!gitSha) return { gitSha: null, gitDirty: null };

    const status = run(['status', '--porcelain']);
    return {
        gitSha,
        gitDirty: status !== null ? status.split('\n').filter(Boolean).length > 0 : null,
    };
}

/** 在产物目录写入构建指纹文件，返回其绝对路径。 */
export function writeBuildMeta({ root, outDir, version }) {
    const { files, sourceHash, fileCount } = hashSourceTree(root);
    const { gitSha, gitDirty } = gitInfo(root);

    const meta = {
        schemaVersion: META_SCHEMA_VERSION,
        version,
        gitSha,
        gitDirty,
        builtAt: new Date().toISOString(),
        sourceHash,
        fileCount,
        files,
    };

    fs.mkdirSync(outDir, { recursive: true });
    const target = path.join(outDir, META_FILE);
    fs.writeFileSync(target, `${JSON.stringify(meta, null, 2)}\n`);
    return target;
}
