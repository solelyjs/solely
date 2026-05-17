import * as vscode from 'vscode';
import { SolelyDefinitionProvider } from './definitionProvider';
import { SolelyDiagnosticProvider } from './diagnosticProvider';
import { SolelyHoverProvider } from './hoverProvider';

export function activate(context: vscode.ExtensionContext) {
    const diagnosticProvider = new SolelyDiagnosticProvider();

    const definitionProvider = vscode.languages.registerDefinitionProvider(
        { language: 'html', scheme: 'file' },
        new SolelyDefinitionProvider(),
    );

    const hoverProvider = vscode.languages.registerHoverProvider(
        { language: 'html', scheme: 'file' },
        new SolelyHoverProvider(),
    );

    const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
        diagnosticProvider.updateDiagnostics(event.document);
    });

    const openListener = vscode.workspace.onDidOpenTextDocument(document => {
        diagnosticProvider.updateDiagnostics(document);
    });

    const closeListener = vscode.workspace.onDidCloseTextDocument(document => {
        diagnosticProvider.clearDiagnostics(document);
    });

    if (vscode.window.activeTextEditor) {
        diagnosticProvider.updateDiagnostics(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        definitionProvider,
        hoverProvider,
        changeListener,
        openListener,
        closeListener,
        diagnosticProvider,
    );

    vscode.window.showInformationMessage('Solely Framework Support 已激活');
}

export function deactivate() {}
