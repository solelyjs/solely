import * as vscode from 'vscode';
import { validateTemplate, validateReferences } from './templateParser';
import { invalidateTypeCache } from './typeResolver';

export class SolelyDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private readonly debounceMs: number;

    /** `debounceMs` 可注入，测试里用很短的间隔避免真实等待 */
    constructor(debounceMs = 300) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('solely-template');
        this.debounceMs = debounceMs;
    }

    updateDiagnostics(document: vscode.TextDocument): void {
        // 只处理磁盘上的 HTML 模板；diff / output / untitled 视图跳过
        if (document.languageId !== 'html' || document.uri.scheme !== 'file') {
            return;
        }

        // Debounce: cancel previous timer for this document
        const key = document.uri.toString();
        const existing = this.debounceTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            this.doUpdateDiagnostics(document);
        }, this.debounceMs);

        this.debounceTimers.set(key, timer);
    }

    private doUpdateDiagnostics(document: vscode.TextDocument): void {
        // 文档可能在防抖窗口内被关闭，close 事件已经清过，不必再跑一遍
        if (document.isClosed) return;

        // 诊断是正确性关口：每轮先递增类型缓存代次，让本轮按文件版本重新校验。
        // 这样即使某些文件不在磁盘监听范围内（工作区外 / watcherExclude），
        // 诊断也不会使用陈旧下标；防抖已经限制了频率。
        invalidateTypeCache();

        const syntaxDiagnostics = validateTemplate(document);
        const refDiagnostics = validateReferences(document);

        const vsDiagnostics: vscode.Diagnostic[] = [...syntaxDiagnostics, ...refDiagnostics].map(
            d => new vscode.Diagnostic(d.range, d.message, d.severity),
        );

        this.diagnosticCollection.set(document.uri, vsDiagnostics);
    }

    clearDiagnostics(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        const timer = this.debounceTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(key);
        }
        this.diagnosticCollection.delete(document.uri);
    }

    dispose(): void {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.diagnosticCollection.dispose();
    }
}
