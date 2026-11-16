#!/usr/bin/env node
/**
 * R-5：`npm run build` 的 prebuild。
 *
 * 默认清理仓库 dist；但只要设置了 SOLELY_BUILD_OUT_DIR（把产物重定向到临时目录），
 * 就跳过清理，避免"安全验证构建"误删仓库 dist。临时目录自身的清理由 Vite 的
 * emptyOutDir 负责。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDirEnv = process.env.SOLELY_BUILD_OUT_DIR;

if (outDirEnv) {
    console.log(
        `[clean-dist] SOLELY_BUILD_OUT_DIR=${outDirEnv}，跳过清理仓库 dist（产物将写入该目录）。`,
    );
    process.exit(0);
}

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
console.log('[clean-dist] 已清理 dist。');
