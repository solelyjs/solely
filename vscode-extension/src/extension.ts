import * as vscode from 'vscode';
import { SolelyDefinitionProvider } from './definitionProvider';
import { SolelyDiagnosticProvider } from './diagnosticProvider';
import { SolelyHoverProvider } from './hoverProvider';
import { clearTsFileCache } from './templateParser';

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

    // Clear TS file cache when files are created/deleted to stay in sync
    const didCreateListener = vscode.workspace.onDidCreateFiles(() => clearTsFileCache());
    const didDeleteListener = vscode.workspace.onDidDeleteFiles(() => clearTsFileCache());
    const didRenameListener = vscode.workspace.onDidRenameFiles(() => clearTsFileCache());

    if (vscode.window.activeTextEditor) {
        diagnosticProvider.updateDiagnostics(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        definitionProvider,
        hoverProvider,
        changeListener,
        openListener,
        closeListener,
        didCreateListener,
        didDeleteListener,
        didRenameListener,
        diagnosticProvider,
    );
}
