import * as vscode from 'vscode';
import {
    extractReferenceAtPosition,
    findCorrespondingTsFile,
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

        if (ref.kind === 'method' || ref.kind === 'chainedMethod') {
            const signatures = getMethodSignatures(tsPath);
            const sig = signatures.find(s => s.name === ref.name);
            if (sig) {
                const kindLabel = ref.kind === 'chainedMethod' ? '链式调用 → ' : '';
                const contents = new vscode.MarkdownString();
                contents.appendCodeblock(`${kindLabel}${sig.signature}`, 'typescript');
                contents.appendMarkdown(
                    `\n\n*在 \`${ref.name}\` 上 ${ref.kind === 'chainedMethod' ? '（链式调用）' : ''}Ctrl+点击跳转到定义*`,
                );
                return new vscode.Hover(contents);
            }
        }

        if (ref.kind === 'dataProp') {
            const propType = getPropTypeFromTsFile(tsPath, ref.name);
            const contents = new vscode.MarkdownString();
            if (propType) {
                contents.appendCodeblock(`$data.${ref.name}: ${propType}`, 'typescript');
            } else {
                contents.appendMarkdown(`**Solely 组件属性** \`$data.${ref.name}\`\n\n`);
            }
            contents.appendMarkdown(`\n\n在 \`@CustomElement\` 装饰器的 \`props\` 数组或 \`interface\` 中定义。`);
            contents.appendMarkdown(`\n\n*Ctrl+点击跳转到属性定义*`);
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
