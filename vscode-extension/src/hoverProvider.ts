import * as vscode from 'vscode';
import {
    extractReferenceAtPosition,
    findCorrespondingTsFile,
    findAncestorFiles,
    findPropertyClassFile,
    getMethodSignatures,
    getPropTypeFromTsFile,
} from './templateParser';

export class SolelyHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): Promise<vscode.Hover | null> {
        const ref = extractReferenceAtPosition(document, position);
        if (!ref) {
            return null;
        }

        const tsPath = findCorrespondingTsFile(document.fileName);
        if (!tsPath) {
            return null;
        }

        if (ref.kind === 'method') {
            let signatures = getMethodSignatures(tsPath, document.fileName);
            let sig = signatures.find(s => s.name === ref.name);
            let source = '组件类';

            // Walk up the inheritance chain
            if (!sig) {
                const ancestorPaths = findAncestorFiles(tsPath, document.fileName);
                for (const ancestorPath of ancestorPaths) {
                    signatures = getMethodSignatures(ancestorPath, document.fileName);
                    sig = signatures.find(s => s.name === ref.name);
                    if (sig) {
                        // Use the class name from the file path as source label
                        source = ancestorPath.split(/[/\\]/).pop()?.replace(/\.ts$/, '') ?? '父类';
                        break;
                    }
                }
            }

            // Fallback for chained method: find in the class of the first-level property
            if (!sig && ref.fullExpression) {
                const chainedMatch = ref.fullExpression.match(/\bthis\.(\w+)\.\w+\s*\(/);
                if (chainedMatch) {
                    const propClassPath = findPropertyClassFile(tsPath, chainedMatch[1], document.fileName);
                    if (propClassPath) {
                        signatures = getMethodSignatures(propClassPath, document.fileName);
                        sig = signatures.find(s => s.name === ref.name);
                        source = chainedMatch[1];
                    }
                }
            }

            if (sig) {
                const contents = new vscode.MarkdownString();
                contents.appendCodeblock(sig.signature, 'typescript');
                contents.appendMarkdown(`\n\n*来自 ${source} — Ctrl+点击跳转到定义*`);
                return new vscode.Hover(contents);
            }
        }

        if (ref.kind === 'dataProp') {
            const propType = getPropTypeFromTsFile(tsPath, ref.name, document.fileName);
            const contents = new vscode.MarkdownString();
            if (propType) {
                contents.appendCodeblock(`$data.${ref.name}: ${propType}`, 'typescript');
            } else {
                contents.appendMarkdown(`**Solely 组件属性** \`$data.${ref.name}\`\n\n`);
            }
            contents.appendMarkdown(`\n\n在 \`super({...})\` 初始化或 \`interface\` 类型定义中声明。`);
            contents.appendMarkdown(`\n\n*Ctrl+点击跳转到属性定义*`);
            return new vscode.Hover(contents);
        }

        if (ref.kind === 'getter') {
            let propType = getPropTypeFromTsFile(tsPath, ref.name, document.fileName);
            let source = '组件类';

            // Walk up the inheritance chain
            if (!propType) {
                const ancestorPaths = findAncestorFiles(tsPath, document.fileName);
                for (const ancestorPath of ancestorPaths) {
                    propType = getPropTypeFromTsFile(ancestorPath, ref.name, document.fileName);
                    if (propType) {
                        source = ancestorPath.split(/[/\\]/).pop()?.replace(/\.ts$/, '') ?? '父类';
                        break;
                    }
                }
            }

            const contents = new vscode.MarkdownString();
            if (propType) {
                contents.appendCodeblock(`get ${ref.name}(): ${propType}`, 'typescript');
            } else {
                contents.appendMarkdown(`**Solely 属性** \`this.${ref.name}\`\n\n`);
            }
            contents.appendMarkdown(`\n\n*来自 ${source} — Ctrl+点击跳转到定义*`);
            return new vscode.Hover(contents);
        }

        if (ref.kind === 'dataKeyword') {
            const contents = new vscode.MarkdownString();
            contents.appendMarkdown(`**Solely 响应式数据** \`$data\`\n\n`);
            contents.appendMarkdown(
                `组件的响应式数据对象，在 \`BaseElement<DataType>\` 泛型参数或 \`super({...})\` 中定义。\n\n`,
            );
            contents.appendMarkdown(`*Ctrl+点击跳转到数据定义*`);
            return new vscode.Hover(contents);
        }

        if (ref.kind === 'ref') {
            const contents = new vscode.MarkdownString();
            contents.appendMarkdown(`**Solely 模板引用** \`ref="${ref.name}"\`\n\n`);
            contents.appendMarkdown(`在 TS 中通过 \`this.$refs.${ref.name}\` 访问该 DOM 元素。\n\n`);
            contents.appendMarkdown(`*Ctrl+点击跳转到 $refs 引用*`);
            return new vscode.Hover(contents);
        }

        return null;
    }
}
