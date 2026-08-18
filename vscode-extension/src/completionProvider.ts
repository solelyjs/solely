import * as vscode from 'vscode';
import {
    findCorrespondingTsFile,
    getMethodSignatures,
    findAncestorFiles,
    extractDataPropsFromTs,
    getComponentMembers,
    type MethodSignature,
} from './templateParser';

/**
 * Solely 模板代码补全 Provider
 *
 * 提供以下补全:
 * - this. 后补全组件方法/getter
 * - $data. 后补全数据属性
 * - $refs. 后补全 ref 名称
 * - < 后补全控制流标签(If/ElseIf/Else/For/Show)
 * - s- 后补全 Solely 指令(s-model/s-class 等)
 * - @ 后补全 DOM 事件(@click/@change 等)
 * - : 后补全属性绑定(:class/:src 等)
 */
export class SolelyCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const line = document.lineAt(position.line).text;
        const charIndex = position.character;
        const textBefore = line.substring(0, charIndex);

        // 1. this. 后补全方法/getter
        if (/\bthis\.\w*$/.test(textBefore)) {
            return this.getThisCompletions(document);
        }

        // 2. $data. 后补全数据属性
        if (/\$data\.\w*$/.test(textBefore)) {
            return this.getDataCompletions(document);
        }

        // 3. $refs. 后补全 ref 名称
        if (/\$refs\.\w*$/.test(textBefore)) {
            return this.getRefsCompletions(document);
        }

        // 4. 控制流标签补全: <I, <F, <S 等
        if (/<[A-Za-z]*$/.test(textBefore)) {
            return this.getControlTagCompletions();
        }

        // 5. s- 指令补全(确保在属性位置: 前面是空格或行首)
        if (/(?:^|\s)s-\w*$/.test(textBefore)) {
            return this.getSDirectiveCompletions();
        }

        // 6. @ 事件补全
        if (/(?:^|\s)@\w*$/.test(textBefore)) {
            return this.getEventCompletions();
        }

        // 7. : 属性绑定补全
        if (/(?:^|\s):\w*$/.test(textBefore)) {
            return this.getBindCompletions();
        }

        return undefined;
    }

    /** this. 后补全: 组件方法 + 父类方法 + getter */
    private getThisCompletions(document: vscode.TextDocument): vscode.CompletionItem[] {
        const tsPath = findCorrespondingTsFile(document.fileName);
        if (!tsPath) return [];

        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

        // 方法(带签名,补全时插入括号)
        const addSignatures = (sigs: MethodSignature[]) => {
            for (const sig of sigs) {
                if (seen.has(sig.name)) continue;
                seen.add(sig.name);
                const item = new vscode.CompletionItem(sig.name, vscode.CompletionItemKind.Method);
                item.detail = sig.signature;
                item.insertText = new vscode.SnippetString(`${sig.name}($1)`);
                items.push(item);
            }
        };

        // 组件自身方法 + 父类方法
        addSignatures(getMethodSignatures(tsPath));
        for (const ancestorPath of findAncestorFiles(tsPath)) {
            addSignatures(getMethodSignatures(ancestorPath));
        }

        // getter(作为属性补全,不带括号)
        const { getters } = getComponentMembers(tsPath);
        for (const name of getters) {
            if (seen.has(name)) continue;
            seen.add(name);
            items.push(new vscode.CompletionItem(name, vscode.CompletionItemKind.Property));
        }

        return items;
    }

    /** $data. 后补全: 从 super({}) 和 interface 解析的数据属性 */
    private getDataCompletions(document: vscode.TextDocument): vscode.CompletionItem[] {
        const tsPath = findCorrespondingTsFile(document.fileName);
        if (!tsPath) return [];

        const props = extractDataPropsFromTs(tsPath);
        return props.map(prop => new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property));
    }

    /** $refs. 后补全: 从当前 HTML 模板解析所有 ref="xxx" */
    private getRefsCompletions(document: vscode.TextDocument): vscode.CompletionItem[] {
        const content = document.getText();
        const refs = new Set<string>();
        const refRegex = /\bref\s*=\s*["']([^"']+)["']/g;
        let match: RegExpExecArray | null;
        while ((match = refRegex.exec(content)) !== null) {
            refs.add(match[1]);
        }
        return Array.from(refs).map(ref => new vscode.CompletionItem(ref, vscode.CompletionItemKind.Variable));
    }

    /** < 后补全: Solely 控制流标签 */
    private getControlTagCompletions(): vscode.CompletionItem[] {
        const tags: { tag: string; detail: string; snippet: string }[] = [
            {
                tag: 'If',
                detail: '条件渲染',
                snippet: 'If test="$1">\n\t$0\n</If>',
            },
            {
                tag: 'ElseIf',
                detail: '否则如果',
                snippet: 'ElseIf test="$1">\n\t$0\n</ElseIf>',
            },
            {
                tag: 'Else',
                detail: '否则',
                snippet: 'Else>\n\t$0\n</Else>',
            },
            {
                tag: 'For',
                detail: '列表循环',
                snippet: 'For each="$1" item="$2" index="$3">\n\t$0\n</For>',
            },
            {
                tag: 'Show',
                detail: '显示控制(支持 keepalive)',
                snippet: 'Show test="$1">\n\t$0\n</Show>',
            },
        ];

        return tags.map(({ tag, detail, snippet }) => {
            const item = new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword);
            item.detail = detail;
            item.insertText = new vscode.SnippetString(snippet);
            return item;
        });
    }

    /** s- 前缀补全: Solely 指令 */
    private getSDirectiveCompletions(): vscode.CompletionItem[] {
        const directives: { name: string; detail: string; snippet: string }[] = [
            { name: 's-model', detail: '双向数据绑定', snippet: 's-model="$1"$0' },
            { name: 's-class', detail: '动态 class 绑定', snippet: 's-class="$1"$0' },
            { name: 's-visible', detail: '可见性控制', snippet: 's-visible="$1"$0' },
            { name: 's-disabled', detail: '禁用状态(布尔)', snippet: 's-disabled="$1"$0' },
            { name: 's-checked', detail: '选中状态(布尔)', snippet: 's-checked="$1"$0' },
            { name: 's-readonly', detail: '只读状态(布尔)', snippet: 's-readonly="$1"$0' },
            { name: 's-required', detail: '必填状态(布尔)', snippet: 's-required="$1"$0' },
            { name: 's-hidden', detail: '隐藏状态(布尔)', snippet: 's-hidden="$1"$0' },
            { name: 's-selected', detail: '选中状态(布尔)', snippet: 's-selected="$1"$0' },
        ];
        return directives.map(({ name, detail, snippet }) => {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
            item.detail = detail;
            item.insertText = new vscode.SnippetString(snippet);
            return item;
        });
    }

    /** @ 前缀补全: DOM 事件 */
    private getEventCompletions(): vscode.CompletionItem[] {
        const events: { name: string; detail: string }[] = [
            { name: '@click', detail: '点击' },
            { name: '@dblclick', detail: '双击' },
            { name: '@change', detail: '内容变化' },
            { name: '@input', detail: '输入' },
            { name: '@keydown', detail: '按键按下' },
            { name: '@keyup', detail: '按键释放' },
            { name: '@keypress', detail: '按键按压' },
            { name: '@submit', detail: '表单提交' },
            { name: '@focus', detail: '获得焦点' },
            { name: '@blur', detail: '失去焦点' },
            { name: '@mouseenter', detail: '鼠标进入' },
            { name: '@mouseleave', detail: '鼠标离开' },
            { name: '@mousedown', detail: '鼠标按下' },
            { name: '@mouseup', detail: '鼠标释放' },
            { name: '@mousemove', detail: '鼠标移动' },
            { name: '@scroll', detail: '滚动' },
            { name: '@wheel', detail: '滚轮' },
            { name: '@contextmenu', detail: '右键菜单' },
            { name: '@drag', detail: '拖拽' },
            { name: '@dragstart', detail: '拖拽开始' },
            { name: '@dragend', detail: '拖拽结束' },
            { name: '@drop', detail: '拖拽放置' },
        ];
        return events.map(({ name, detail }) => {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Event);
            item.detail = detail;
            item.insertText = new vscode.SnippetString(`${name}="$1"$0`);
            return item;
        });
    }

    /** : 前缀补全: 属性绑定 */
    private getBindCompletions(): vscode.CompletionItem[] {
        const binds: { name: string; detail: string }[] = [
            { name: ':class', detail: '动态 class 绑定' },
            { name: ':style', detail: '动态 style 绑定' },
            { name: ':src', detail: '资源地址绑定' },
            { name: ':href', detail: '链接地址绑定' },
            { name: ':value', detail: '值绑定' },
            { name: ':disabled', detail: '禁用状态绑定' },
            { name: ':checked', detail: '选中状态绑定' },
            { name: ':visible', detail: '可见性绑定' },
            { name: ':readonly', detail: '只读状态绑定' },
            { name: ':required', detail: '必填状态绑定' },
            { name: ':hidden', detail: '隐藏状态绑定' },
            { name: ':selected', detail: '选中状态绑定' },
            { name: ':title', detail: '标题绑定' },
            { name: ':alt', detail: '替代文本绑定' },
            { name: ':id', detail: 'ID 绑定' },
            { name: ':placeholder', detail: '占位符绑定' },
        ];
        return binds.map(({ name, detail }) => {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
            item.detail = detail;
            item.insertText = new vscode.SnippetString(`${name}="$1"$0`);
            return item;
        });
    }
}
