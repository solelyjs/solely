/**
 * TS 源码读取与缓存。
 *
 * 模板诊断、跳转、补全都从这里拿「原文 + 掩码文本 + 类声明」。
 * 缓存键用编辑器文档 version 或磁盘 mtime+size，保证未保存的代码也能立即参与解析。
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ClassInfo, listClasses, maskTypeScript } from './tsSource';

export interface SourceInfo {
    text: string;
    masked: string;
    classes: ClassInfo[];
    version: string;
}

const sourceCache = new Map<string, SourceInfo>();

function buildSource(filePath: string, text: string, version: string): SourceInfo {
    const masked = maskTypeScript(text);
    const info: SourceInfo = { text, masked, classes: listClasses(masked), version };
    sourceCache.set(filePath, info);
    return info;
}

/**
 * 读取 TS 源码。优先用编辑器里**未保存**的内容，保证刚写完的方法立刻参与诊断；
 * 用 version（文档 version / mtime+size）做缓存键，避免每次调用都重新掩码。
 */
export function loadSource(filePath: string): SourceInfo | null {
    const documents: readonly vscode.TextDocument[] = vscode.workspace?.textDocuments ?? [];
    const open = documents.find(doc => doc.uri?.scheme === 'file' && doc.uri.fsPath === filePath);
    if (open) {
        const version = `doc:${open.version}`;
        const cached = sourceCache.get(filePath);
        if (cached && cached.version === version) return cached;
        return buildSource(filePath, open.getText(), version);
    }

    let stat: fs.Stats;
    try {
        stat = fs.statSync(filePath);
    } catch {
        sourceCache.delete(filePath);
        return null;
    }

    const version = `fs:${stat.mtimeMs}:${stat.size}`;
    const cached = sourceCache.get(filePath);
    if (cached && cached.version === version) return cached;

    try {
        return buildSource(filePath, fs.readFileSync(filePath, 'utf-8'), version);
    } catch {
        return null;
    }
}

/** 文件增删改名后清空（路径 → 源码）缓存，避免常驻内存随项目增长 */
export function clearSourceCache(): void {
    sourceCache.clear();
}
