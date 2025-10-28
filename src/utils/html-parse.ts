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
    key?: string;
    handlers?: Record<string, EventListenerOrEventListenerObject>;
    rootId: string;
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
    ifId?: number;
    model?: string;
    onMounted?: (elm: HTMLElement, loops?: Loop[]) => void;
    onUpdated?: (elm: HTMLElement, loops?: Loop[]) => void;
}

function compressHtml(html: string): string {
    return html
        .replace(/>\s+</g, '><')
        .replace(/\s+/g, ' ');
}

function parseTag(ctx: any, tag: string): ASTNode {
    const tagName = (tag.match(tagNameRE) || [])[1] || '';
    const ast: ASTNode = {
        rootId: '0',
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

        if (key === "onMounted" || key === "onUpdated") {
            // 解析生命周期钩子
            ast[key] = createLifecycleHandler(ctx, value);
        }
        else if (listeners.includes(key) || key.startsWith("on-")) {
            ast.on[key.startsWith("on-") ? key.slice(3) : key.slice(2)] = createEventHandler(ctx, value);
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
                case "for":
                    ast.props["htmlFor"] = (loops: Loop[]) => getValue(ctx, value, loops);
                    break;
                case "tabindex":
                    ast.props["tabIndex"] = (loops: Loop[]) => getValue(ctx, value, loops);
                    break;
                case "contenteditable":
                    ast.props["contentEditable"] = (loops: Loop[]) => getValue(ctx, value, loops);
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

        // 合并同名事件
        const mergeEvent = (eventName: string, modelHandler: ReturnType<typeof createEventHandler>) => {
            if (ast.on[eventName]) {
                const userHandler = ast.on[eventName];
                ast.on[eventName] = (event: Event, loops: Loop[]) => {
                    // 先执行 model，再执行用户逻辑
                    modelHandler(event, loops);
                    userHandler(event, loops);
                };
            } else {
                ast.on[eventName] = modelHandler;
            }
        };

        if (tagName === 'input') {
            const type = ast.attrs.type || 'text';
            if (type === 'checkbox') {
                ast.props['checked'] = updateValue;
                mergeEvent('change', createEventHandler(ctx, `$data.${key}=checked`));
            } else if (type === 'radio') {
                const radioValue = ast.attrs.value;
                ast.props['checked'] = (loops: Loop[]) => updateValue(loops) == radioValue;
                mergeEvent('change', createEventHandler(ctx, `if(checked){$data.${key}='${radioValue}'}`));
            } else {
                ast.props['value'] = updateValue;
                mergeEvent('input', createEventHandler(ctx, `$data.${key}=value`));
            }
        }
        else if (tagName === 'textarea') {
            ast.props['value'] = updateValue;
            mergeEvent('input', createEventHandler(ctx, `$data.${key}=value`));
        }
        else if (tagName === 'select') {
            const isMultiple = 'multiple' in ast.attrs;

            // 用户操作 -> 更新 $data
            if (isMultiple) {
                mergeEvent(
                    'change',
                    createEventHandler(ctx, `
                        $data.${key} = Array.from(event.target.selectedOptions).map(o => o.value);
                    `)
                );
            } else {
                mergeEvent('change', createEventHandler(ctx, `$data.${key}=value`));
                ast.props['value'] = updateValue; // 单选仍然用 value
            }

            // 数据 -> DOM（渲染或更新时同步）
            const syncSelectValue = (elm: HTMLSelectElement, loops: Loop[] = []) => {
                const v = updateValue(loops);
                if (isMultiple) {
                    // 多选时，如果不是数组，自动转成数组
                    const values = Array.isArray(v) ? v : v != null ? [v] : [];
                    for (const opt of elm.options) {
                        opt.selected = values.includes(opt.value);
                    }
                } else {
                    const val = v ?? '';
                    if (elm.value !== val) elm.value = val;
                }
            };

            // 保留原本的 onMounted/onUpdated
            const oldMounted = ast.onMounted;
            const oldUpdated = ast.onUpdated;

            ast.onMounted = (elm: HTMLElement, loops?: Loop[]) => {
                oldMounted?.(elm, loops);
                syncSelectValue(elm as HTMLSelectElement, loops || []);
            };

            ast.onUpdated = (elm: HTMLElement, loops?: Loop[]) => {
                oldUpdated?.(elm, loops);
                syncSelectValue(elm as HTMLSelectElement, loops || []);
            };
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
                    rootId: '0',
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
                rootId: '0',
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
            rootId: '0',
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

/**
 * 🔹 表达式求值函数
 * 用于解析模板中的 {{ 表达式 }} 或 s-xxx 属性。
 * 语义：计算并返回表达式结果。
 */
export const getValue = (
    ctx: any,
    template: string,
    loops: Loop[]
): any => {
    try {
        const func = createFunction([
            '$data',
            ...loops.map(loop => loop.item),
            ...loops.map(loop => loop.index),
            // 表达式求值，返回结果
            `return (${template})`
        ]).bind(ctx);

        return func(
            ctx.$data,
            ...loops.map(loop => loop.value),
            ...loops.map(loop => loop.valueIndex)
        );
    } catch (e) {
        console.error(
            `[BaseElement][${ctx.tagName}] Error evaluating expression: {{ ${template} }}`, ctx, e
        );
        return '';
    }
};


/**
 * 🔹 事件处理器创建函数
 * 用于解析 onClick、onInput 等事件属性。
 * 语义：执行表达式或语句；返回表达式结果（通常被忽略）。
 */
export const createEventHandler = (ctx: any, handler: string) => {
    return (event: Event | any, loops: Loop[]) => {
        try {
            const func = createFunction([
                '$data',
                'event',
                'value',
                'checked',
                ...loops.map(loop => loop.item),
                ...loops.map(loop => loop.index),
                handler
            ]).bind(ctx);

            return func(
                ctx.$data,
                event,
                event?.target?.value,
                event?.target?.checked,
                ...loops.map(loop => loop.value),
                ...loops.map(loop => loop.valueIndex)
            );
        } catch (e) {
            console.error(
                `[BaseElement][${ctx.tagName}] Error executing event handler "${handler}"`, ctx, e
            );
        }
    };
};


/**
 * 🔹 生命周期钩子创建函数
 * 用于解析 onMounted / onUpdated。
 * 语义：执行一段副作用语句块；不返回值。
 */
export const createLifecycleHandler = (ctx: any, handler: string) => {
    return (elm: HTMLElement, loops: Loop[] = []) => {
        try {
            const func = createFunction([
                '$data',
                'elm',
                ...loops.map(loop => loop.item),
                ...loops.map(loop => loop.index),
                // 执行语句块（无 return）
                `(function(){ ${handler} }).call(this)`
            ]).bind(ctx);

            func(
                ctx.$data,
                elm,
                ...loops.map(loop => loop.value),
                ...loops.map(loop => loop.valueIndex)
            );
        } catch (e) {
            console.error(
                `[BaseElement][${ctx.tagName}] Error executing lifecycle handler "${handler}"`, ctx, e
            );
        }
    };
};
