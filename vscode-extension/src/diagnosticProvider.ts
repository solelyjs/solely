import * as vscode from 'vscode';
import { validateTemplate } from './templateParser';

export class SolelyDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private readonly DEBOUNCE_MS = 300;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('solely-template');
    }

    updateDiagnostics(document: vscode.TextDocument): void {
        if (document.languageId !== 'html') {
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
        }, this.DEBOUNCE_MS);

        this.debounceTimers.set(key, timer);
    }

    private doUpdateDiagnostics(document: vscode.TextDocument): void {
        const diagnostics = validateTemplate(document);
        const vsDiagnostics: vscode.Diagnostic[] = diagnostics.map(d => {
            return new vscode.Diagnostic(d.range, d.message, d.severity);
        });

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
