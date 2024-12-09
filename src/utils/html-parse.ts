import { createFunction, listeners } from ".";

const tagRE = /<!--(?:.|\s)*?-->|<[a-zA-Z0-9\-/](?:"[^"]*"|'[^']*'|[^'">])*>/g; // 匹配注释和标签
const tagNameRE = /<\/?([^\s]+?)[/\s>]/;  // 标签名称
const attrRE = /\s([^'"/\s><]+?)[\s/>]|([^\s=]+)=\s?(".*?"|'.*?')/g; // 属性
const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]; // 自闭合标签

const varRE = /\{\{(.+?)\}\}/g; // 修改后的名字

export interface Loop {
    item: string;
    value: any;
    index: string;
    valueIndex: number;
}

export interface ASTNode {
    rootId: number;
    tagName: string;
    attrs: Record<string, string>;
    props: Record<string, Function>;
    styles?: Function;
    classes?: Function;
    on: Record<string, (event: Event, loops: Loop[]) => any>;
    content?: string | ((loops: Loop[]) => string);
    children: ASTNode[];
    elm?: Node;
    fn?: Function;
    loops?: Loop[];
    isIf?: boolean;
    model?: string;
}

function compressHtml(html: string): string {
    return html
        .replace(/>\s+</g, '><')
        .replace(/\s+/g, ' ');
}

function parseTag(ctx: any, tag: string): ASTNode {
    const tagName = (tag.match(tagNameRE) || [])[1] || '';
    const ast: ASTNode = {
        rootId: 0,
        tagName,
        attrs: {},
        props: {},
        on: {},
        children: []
    };

    const reg = new RegExp(attrRE);

    while (true) {
        const result = reg.exec(tag);
        if (result === null) break;

        if (!result[0].trim()) continue;

        const [key, value] = result[1]
            ? result[1].trim().split('=')
            : [result[2], result[3].trim().slice(1, -1)];

        if (listeners.includes(key) || key.startsWith("on-")) {
            ast.on[key.startsWith("on-") ? key.slice(3) : key.slice(2)] = createEventHandler(ctx, `return (${value})`);
        } else if (key.startsWith("s-")) {
            const propKey = key.slice(2);
            switch (propKey) {
                case "model":
                    ast.model = value;
                    break;
                case "style":
                    ast.styles = (loops: Loop[]) => getValue(ctx, value, loops);
                    break;
                case "class":
                    ast.classes = (loops: Loop[]) => getValue(ctx, value, loops);
                    break;
                case "readonly":
                    ast.props["readOnly"] = (loops: Loop[]) => getValue(ctx, value, loops);
                    break;
                default:
                    ast.props[propKey] = (loops: Loop[]) => getValue(ctx, value, loops);
                    break;
            }
        } else {
            ast.attrs[key] = value;
        }
        reg.lastIndex--;
    }

    if (tagName === 'For') {
        ast.fn = (loops: Loop[]) => getValue(ctx, ast.attrs.each as string, loops);
    } else if (tagName === 'If' || tagName === 'ElseIf') {
        ast.fn = (loops: Loop[]) => getValue(ctx, ast.attrs.condition as string, loops);
    }

    if (ast.model) {
        const key = ast.model.replace('this.', '').replace('$data.', '');
        const updateValue = (loops: Loop[]) => getValue(ctx, `$data.${key}`, loops);
        const eventHandler = (type: string) => createEventHandler(ctx, `$data.${key}=${type}`);

        // 根据tagName和type设置属性和事件
        if (tagName === 'input') {
            if (ast.attrs.type === 'checkbox' || ast.attrs.type === 'radio') {
                ast.props['checked'] = updateValue;
                ast.on['change'] = eventHandler('checked');
            } else {
                ast.props['value'] = updateValue;
                ast.on['input'] = eventHandler('value');
            }
        } else if (tagName === 'textarea') {
            ast.props['value'] = updateValue;
            ast.on['input'] = eventHandler('value');
        } else if (tagName === 'select') {
            ast.props['value'] = updateValue;
            ast.on['change'] = eventHandler('value');
        }
    }

    return ast;
}


export function parseHtml(ctx: any, html: string): ASTNode[] {
    const astNodes: ASTNode[] = [];
    if (!html) return astNodes;

    html = compressHtml(html);
    const stack: ASTNode[] = [];
    const openingTags: string[] = [];

    const getCurrent = (): ASTNode[] => stack.length === 0 ? astNodes : stack[stack.length - 1].children ||= [];

    let index = 0;
    html.replace(tagRE, (tag, offset) => {
        const current = getCurrent();
        if (offset > index) {
            const value = html.substring(index, offset).trim();
            if (value) {
                varRE.lastIndex = 0; // 重置正则表达式的匹配位置
                const isStatic = !varRE.test(value);
                const content = isStatic ? value : (loops: Loop[]) => value.replace(varRE, (_, match) => getValue(ctx, match, loops));
                current.push({
                    rootId: 0,
                    tagName: "text",
                    attrs: {},
                    props: {},
                    on: {},
                    content,
                    children: []
                });
            }
        }
        index = offset + tag.length;

        if (tag.startsWith('<!--') && tag.endsWith('-->')) {
            current.push({
                rootId: 0,
                tagName: "comment",
                attrs: {},
                props: {},
                on: {},
                content: tag.slice(4, -3),
                children: []
            });
        } else if (tag.startsWith('</')) {
            const lastOpeningTag = openingTags.pop()!;
            while (stack.length > 0 && stack[stack.length - 1].tagName !== lastOpeningTag) {
                stack.pop();
            }
            stack.pop();
        } else {
            const ast = parseTag(ctx, tag);
            const isVoidElement = tag.endsWith('/>') || voidElements.includes(ast.tagName);
            current.push(ast);
            if (!isVoidElement) {
                stack.push(ast);
                openingTags.push(ast.tagName);
            }
        }
        return '';
    });

    if (html.length > index) {
        astNodes.push({
            rootId: 0,
            tagName: "text",
            attrs: {},
            props: {},
            on: {},
            content: html.substring(index).trim(),
            children: []
        });
    }

    return astNodes;
}

const getValue = (ctx: any, template: string, loops: Loop[]): any => {
    try {
        const func = createFunction(["$data", ...loops.map(loop => loop.item), `return (${template})`]).bind(ctx);
        return func(ctx.$data, ...loops.map(loop => loop.value));
    } catch (e) {
        console.error(e);
    }
};

const createEventHandler = (ctx: any, handler: string) => {
    return (event: Event | any, loops: Loop[]) => {
        const func = createFunction(["$data", "event", "value", "checked", ...loops.map(loop => loop.item), handler]).bind(ctx);
        return func(ctx.$data, event, event.target.value, event.target.checked, ...loops.map(loop => loop.value));
    };
};