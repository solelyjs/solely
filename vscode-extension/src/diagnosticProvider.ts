import * as vscode from 'vscode';
import { validateTemplate } from './templateParser';

export class SolelyDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('solely-template');
    }

    updateDiagnostics(document: vscode.TextDocument): void {
        if (document.languageId !== 'html') {
            return;
        }

        const diagnostics = validateTemplate(document);
        const vsDiagnostics: vscode.Diagnostic[] = diagnostics.map(d => {
            return new vscode.Diagnostic(d.range, d.message, d.severity);
        });

        this.diagnosticCollection.set(document.uri, vsDiagnostics);
    }

    clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
