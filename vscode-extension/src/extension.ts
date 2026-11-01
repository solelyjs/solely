import * as vscode from 'vscode';
import { SolelyCompletionProvider } from './completionProvider';
import { SolelyDefinitionProvider } from './definitionProvider';
import { SolelyDiagnosticProvider } from './diagnosticProvider';
import { SolelyHoverProvider } from './hoverProvider';
import {
    clearTsFileCache,
    findCorrespondingTsFile,
    findCorrespondingHtmlFile,
    invalidateForChangedFile,
} from './templateParser';

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

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'html', scheme: 'file' },
        new SolelyCompletionProvider(),
        '.',
        '<',
        '@',
        ':',
        '-',
    );

    // HTML ↔ TS 切换命令: 在 HTML 模板和对应 TS 组件之间快速切换
    const switchCommand = vscode.commands.registerCommand('solely.switchToCorrespondingFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('没有打开的文件');
            return;
        }

        const filePath = editor.document.fileName;
        const langId = editor.document.languageId;

        if (langId === 'html') {
            const tsPath = findCorrespondingTsFile(filePath);
            if (tsPath) {
                await vscode.window.showTextDocument(vscode.Uri.file(tsPath));
            } else {
                vscode.window.showInformationMessage('未找到对应的 TS 组件文件');
            }
        } else if (langId === 'typescript' || langId === 'typescriptreact') {
            const htmlPath = findCorrespondingHtmlFile(filePath);
            if (htmlPath) {
                await vscode.window.showTextDocument(vscode.Uri.file(htmlPath));
            } else {
                vscode.window.showInformationMessage('未找到对应的 HTML 模板文件');
            }
        } else {
            vscode.window.showInformationMessage('请在 HTML 模板或 TS 组件文件中使用此命令');
        }
    });

    const isScriptDocument = (document: vscode.TextDocument): boolean =>
        document.languageId === 'typescript' || document.languageId === 'typescriptreact';

    const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (isScriptDocument(event.document)) {
            // TS 内容变了：模板与组件的关联、父类解析、成员签名都可能失效，
            // 同时刷新所有已打开的模板，否则改名后 HTML 侧诊断会一直是旧的
            invalidateForChangedFile(event.document.fileName);
            for (const document of vscode.workspace.textDocuments) {
                diagnosticProvider.updateDiagnostics(document);
            }
            return;
        }
        diagnosticProvider.updateDiagnostics(event.document);
    });

    const openListener = vscode.workspace.onDidOpenTextDocument(document => {
        diagnosticProvider.updateDiagnostics(document);
    });

    const closeListener = vscode.workspace.onDidCloseTextDocument(document => {
        diagnosticProvider.clearDiagnostics(document);
    });

    // 文件增删改名会改变模板 ↔ 组件的关联
    const didCreateListener = vscode.workspace.onDidCreateFiles(() => clearTsFileCache());
    const didDeleteListener = vscode.workspace.onDidDeleteFiles(() => clearTsFileCache());
    const didRenameListener = vscode.workspace.onDidRenameFiles(() => clearTsFileCache());

    // 启动时把已经打开的文档全部扫一遍，而不是只看当前激活的那个
    for (const document of vscode.workspace.textDocuments) {
        diagnosticProvider.updateDiagnostics(document);
    }

    context.subscriptions.push(
        definitionProvider,
        hoverProvider,
        completionProvider,
        switchCommand,
        changeListener,
        openListener,
        closeListener,
        didCreateListener,
        didDeleteListener,
        didRenameListener,
        diagnosticProvider,
    );
}
