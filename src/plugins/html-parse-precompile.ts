// import { listeners } from "@/shared";


// const tagRE = /<!--(?:.|\s)*?-->|<[a-zA-Z0-9\-/](?:"[^"]*"|'[^']*'|[^'">])*>/g; // 匹配注释和标签
// const tagNameRE = /<\/?([^\s]+?)[/\s>]/;  // 标签名称
// const attrRE = /\s([^'"/\s><]+?)[\s/>]|([^\s=]+)=\s?(".*?"|'.*?')/g; // 属性
// const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]; // 自闭合标签

// const varRE = /\{\{(.+?)\}\}/g; // {{ 变量 }}

// /** ----- Types ----- */
// export interface ASTNode {
//     key?: string;
//     handlers?: Record<string, EventListenerOrEventListenerObject>;
//     rootId: string;
//     tagName: string;
//     attrs: Record<string, string>;
//     props: Record<string, Function | string>;
//     styles?: Function | string;
//     classes?: Function | string;
//     on: Record<string, string | ((event: Event, loops: Loop[]) => any)>;
//     content?: string | ((loops: Loop[]) => string) | string;
//     children: ASTNode[];
//     elm?: Node;
//     fn?: Function | string;
//     loops?: Loop[]; // 仍保留字段但不强制使用（可选）
//     ifId?: number;
//     model?: string;
//     onMounted?: string | ((elm: HTMLElement, loops?: Loop[]) => void);
//     onUpdated?: string | ((elm: HTMLElement, loops?: Loop[]) => void);
// }

// /** 压缩 HTML（保留结构，但收敛空白） */
// function compressHtml(html: string): string {
//     return html
//         .replace(/>\s+</g, '><')
//         .replace(/\s+/g, ' ');
// }

// /** 生成可序列化的函数字符串（用于预编译） */
// type GenType = 'template' | 'handler' | 'expression' | 'lifecycle';

// /** 把 code 包成函数字符串 */
// const genFunctionString = (input: string, type: GenType, locals: Loop[] = []): string => {
//     if (!input?.trim()) return "";

//     if (/\{\{\{\s*.*?\s*\}\}\}/.test(input)) {
//         throw new Error("Illegal interpolation syntax: use {{ }} instead of {{{ }}}");
//     }

//     const escapeBacktick = (str: string) => str.replace(/`/g, '\\`');

//     const typeBodyMap: Record<string, string> = {
//         template: `return \`${input.replace(/\{\{\s*(.*?)\s*\}\}/g, (_, e) => `\${${e.trim()}}`)}\`;`,
//         expression: `return (${input});`,
//         handler: input.endsWith(';') ? input : input + ';',
//         lifecycle: input.endsWith(';') ? input : input + ';',
//     };

//     const body = typeBodyMap[type] ?? input;
//     const isLifecycle = type === 'lifecycle';
//     const useEvent = type === 'handler';

//     // locals 解构（当 locals 非空时生成解构代码）
//     const loopValues = locals.length ? `var [${locals.map(l => l.item).join(', ')}] = loops.map(l => l.value);` : '';
//     const loopIndices = locals.length ? `var [${locals.map(l => l.index).join(', ')}] = loops.map(l => l.valueIndex);` : '';

//     const eventDestructure = useEvent ? 'const { value, checked } = event?.target || {};' : '';

//     return `
// __solely__
// (${isLifecycle ? 'elm,' : useEvent ? 'event,' : ''} loops = []) => {
//     try {
//         const { $data } = this;
//         ${eventDestructure}
//         ${loopValues}
//         ${loopIndices}
//         ${body}
//     } catch (e) {
//         console.error(\`[Template Error] <\${this.tagName}> ${escapeBacktick(input)}\`, e);
//         ${type === 'template' || type === 'expression' ? "return '';" : ''}
//     }
// }
// __solely__
// `.replace(/\s+/g, ' ').trim();
// };

// const buildTemplate = (code: string, locals: Loop[] = []) => genFunctionString(code, 'template', locals);
// const buildExpression = (code: string, locals: Loop[] = []) => genFunctionString(code, 'expression', locals);
// const buildEventHandler = (code: string, locals: Loop[] = []) => genFunctionString(code, 'handler', locals);
// const buildLifecycleHandler = (code: string, locals: Loop[] = []) => genFunctionString(code, 'lifecycle', locals);

// /** 解析单个标签，返回 ASTNode（属性里把事件/生命周期/表达式都转成字符串） */
// /** 注意：parseTag 只负责把标签解析成 ASTNode，不负责把 For 入栈（入栈由 parseHtml 控制） */
// function parseTag(tag: string, localsStack: Loop[]): ASTNode {
//     const tagName = (tag.match(tagNameRE) || [])[1] || '';
//     const ast: ASTNode = {
//         rootId: '0',
//         tagName,
//         attrs: {},
//         props: {},
//         on: {},
//         children: []
//     };

//     const reg = new RegExp(attrRE);

//     // 将 attribute 解析为 ast 的属性
//     while (true) {
//         const result = reg.exec(tag);
//         if (result === null) break;

//         if (!result[0].trim()) continue;

//         const [key, value] = result[1]
//             ? result[1].trim().split('=')
//             : [result[2], result[3].trim().slice(1, -1)];

//         if (!key) continue;

//         if (key === "onMounted" || key === "onUpdated") {
//             // 生命周期 -> 预编译为字符串函数（lifecycle）
//             ast[key] = buildLifecycleHandler(value, localsStack);
//         }
//         else if (listeners.has(key) || key.startsWith("on-")) {
//             // 事件属性（如 on:click 或 on-click）
//             const eventName = key.startsWith("on-") ? key.slice(3) : key.slice(2);
//             ast.on[eventName] = buildEventHandler(value, localsStack);
//         } else if (key.startsWith("s-")) {
//             const propKey = key.slice(2);
//             switch (propKey) {
//                 case "model":
//                     ast.model = value;
//                     break;
//                 case "style":
//                     ast.styles = buildExpression(value, localsStack);
//                     break;
//                 case "class":
//                     ast.classes = buildExpression(value, localsStack);
//                     break;
//                 case "readonly":
//                     ast.props["readOnly"] = buildExpression(value, localsStack);
//                     break;
//                 case "for":
//                     ast.props["htmlFor"] = buildExpression(value, localsStack);
//                     break;
//                 case "tabindex":
//                     ast.props["tabIndex"] = buildExpression(value, localsStack);
//                     break;
//                 case "contenteditable":
//                     ast.props["contentEditable"] = buildExpression(value, localsStack);
//                     break;
//                 default:
//                     ast.props[propKey] = buildExpression(value, localsStack);
//                     break;
//             }
//         } else {
//             // 普通属性（boolean 属性会得到 undefined 值 => 保留空字符串）
//             ast.attrs[key] = value ?? '';
//         }
//         // 防止死循环（attrRE 复杂，保持原来的索引回退策略）
//         reg.lastIndex--;
//     }

//     // 特殊解析 For / If / ElseIf 的表达式函数（保留为 expression）
//     if (tagName === 'For') {
//         // NOTE: 不在这里入栈 — 只把 each 表达式编译为函数（此时 localsStack 不包含当前 For 本身）
//         ast.fn = buildExpression(ast.attrs.each || '', localsStack);
//     } else if (tagName === 'If' || tagName === 'ElseIf') {
//         ast.fn = buildExpression(ast.attrs.condition || '', localsStack);
//     }

//     // 处理 s-model 绑定（把原来的运行时逻辑改为预编译字符串）
//     if (ast.model) {
//         // 例如 ast.model = "this.x" 或 "$data.x" 等 -> 我们规范化 key 为 $data.x 的形式
//         const key = ast.model.replace('this.', '').replace('$data.', '');
//         const dataExpr = `$data.${key}`; // 直接用表达式在生命周期/事件/props 中引用

//         // 协助合并事件（事件在 AST 中用字符串函数）
//         const mergeEvent = (eventName: string, modelHandlerCode: string) => {
//             const modelHandlerStr = buildEventHandler(modelHandlerCode, localsStack);

//             if (ast.on[eventName]) {
//                 // ast.on[eventName] 可能是字符串（我们的常见情况）
//                 const existing = ast.on[eventName];
//                 const existingStr = typeof existing === 'string' ? existing : String(existing);
//                 // 合并成一个新的 handler 字符串函数，依次执行原 handler 与 model handler
//                 ast.on[eventName] = genFunctionString(`
//                     (${existingStr})(event, loops);
//                     (${modelHandlerStr})(event, loops);
//                 `, 'handler', localsStack);
//             } else {
//                 ast.on[eventName] = modelHandlerStr;
//             }
//         };

//         const tagLower = ast.tagName.toLowerCase();

//         if (tagLower === 'input') {
//             const type = ast.attrs.type || 'text';
//             if (type === 'checkbox') {
//                 // 数据 -> DOM：checked 状态由表达式来决定
//                 ast.props['checked'] = buildExpression(dataExpr, localsStack);
//                 // DOM -> 数据：change 事件更新 $data
//                 mergeEvent('change', `$data.${key} = event?.target?.checked`);
//             } else if (type === 'radio') {
//                 const radioValue = ast.attrs.value;
//                 // 数据 -> DOM：checked = ($data.key == radioValue)
//                 ast.props['checked'] = buildExpression(`${dataExpr} == '${radioValue}'`, localsStack);
//                 mergeEvent('change', `if(event?.target?.checked){ $data.${key} = '${radioValue}'; }`);
//             } else {
//                 // 普通 input
//                 ast.props['value'] = buildExpression(dataExpr, localsStack);
//                 mergeEvent('input', `$data.${key} = event?.target?.value`);
//             }
//         }
//         else if (tagLower === 'textarea') {
//             ast.props['value'] = buildExpression(dataExpr, localsStack);
//             mergeEvent('input', `$data.${key} = event?.target?.value`);
//         }
//         else if (tagLower === 'select') {
//             const isMultiple = 'multiple' in ast.attrs;

//             // 用户交互 -> 更新 $data
//             if (isMultiple) {
//                 mergeEvent('change', `
//                     $data.${key} = Array.from(event?.target?.selectedOptions || []).map(o => o.value);
//                 `);
//             } else {
//                 mergeEvent('change', `$data.${key} = event?.target?.value`);
//                 ast.props['value'] = buildExpression(dataExpr, localsStack);
//             }

//             // 数据 -> DOM：把同步逻辑写成 lifecycle （onMounted/onUpdated）
//             const syncBody = isMultiple ? `
//                 const v = ${dataExpr};
//                 const values = Array.isArray(v) ? v : v != null ? [v] : [];
//                 for (const opt of elm.options) {
//                     opt.selected = values.includes(opt.value);
//                 }
//             ` : `
//                 const v = ${dataExpr};
//                 const val = v ?? '';
//                 if (elm.value !== val) elm.value = val;
//             `;

//             // 保留原生命周期（如果存在，则把原来的字符串与新的同步逻辑合并）
//             const oldMounted = ast.onMounted;
//             const oldUpdated = ast.onUpdated;

//             if (oldMounted) {
//                 const oldMountedStr = typeof oldMounted === 'string' ? oldMounted : String(oldMounted);
//                 ast.onMounted = genFunctionString(`
//                     (${oldMountedStr})(elm, loops);
//                     ${syncBody}
//                 `, 'lifecycle', localsStack);
//             } else {
//                 ast.onMounted = buildLifecycleHandler(syncBody, localsStack);
//             }

//             if (oldUpdated) {
//                 const oldUpdatedStr = typeof oldUpdated === 'string' ? oldUpdated : String(oldUpdated);
//                 ast.onUpdated = genFunctionString(`
//                     (${oldUpdatedStr})(elm, loops);
//                     ${syncBody}
//                 `, 'lifecycle', localsStack);
//             } else {
//                 ast.onUpdated = buildLifecycleHandler(syncBody, localsStack);
//             }
//         }
//     }

//     return ast;
// }

// /**
//  * parseHtml -> 返回 ASTNode[] 字符串（所有动态逻辑都以字符串形式预编译）
//  */
// export function parseHtml(html: string): string {
//     const astNodes: ASTNode[] = [];
//     if (!html) return "";

//     html = compressHtml(html);
//     const stack: ASTNode[] = [];
//     const openingTags: string[] = [];
//     const localsStack: Loop[] = []; // 循环变量作用域栈

//     const getCurrent = (): ASTNode[] => stack.length === 0 ? astNodes : stack[stack.length - 1].children ||= [];

//     let index = 0;
//     html.replace(tagRE, (tag, offset) => {
//         const current = getCurrent();
//         if (offset > index) {
//             const value = html.substring(index, offset).trim();
//             if (value) {
//                 varRE.lastIndex = 0;
//                 const isStatic = !varRE.test(value);
//                 const content = isStatic ? value : buildTemplate(value, localsStack);
//                 current.push({
//                     rootId: '0',
//                     tagName: "text",
//                     attrs: {},
//                     props: {},
//                     on: {},
//                     content,
//                     children: []
//                 });
//             }
//         }
//         index = offset + tag.length;

//         if (tag.startsWith('<!--') && tag.endsWith('-->')) {
//             current.push({
//                 rootId: '0',
//                 tagName: "comment",
//                 attrs: {},
//                 props: {},
//                 on: {},
//                 content: tag.slice(4, -3),
//                 children: []
//             });
//         } else if (tag.startsWith('</')) {
//             const lastOpeningTag = openingTags.pop()!;
//             while (stack.length > 0 && stack[stack.length - 1].tagName !== lastOpeningTag) {
//                 stack.pop();
//             }
//             const popped = stack.pop();

//             // For 标签闭合时出栈 locals
//             if (popped?.tagName === 'For') {
//                 localsStack.pop();
//             }
//         } else {
//             // 先把标签解析成 ast（parseTag 仅解析属性并生成表达式/handler 字符串，使用当前 localsStack）
//             const ast = parseTag(tag, localsStack);

//             // For 标签时，入栈 locals（注意：此处 ast.attrs 已经被 parseTag 填充，可以读取 item/index）
//             if (ast.tagName === 'For') {
//                 const item = ast.attrs.item || 'item';
//                 const indexName = ast.attrs.index || 'index';
//                 localsStack.push({ item, index: indexName, value: null, valueIndex: 0 });
//             }

//             const isVoidElement = tag.endsWith('/>') || voidElements.includes(ast.tagName.toLowerCase());
//             current.push(ast);
//             if (!isVoidElement) {
//                 stack.push(ast);
//                 openingTags.push(ast.tagName);
//             }
//         }
//         return '';
//     });

//     // trailing text
//     if (html.length > index) {
//         const trailing = html.substring(index).trim();
//         if (trailing) {
//             astNodes.push({
//                 rootId: '0',
//                 tagName: "text",
//                 attrs: {},
//                 props: {},
//                 on: {},
//                 content: varRE.test(trailing) ? buildTemplate(trailing, localsStack) : trailing,
//                 children: []
//             });
//         }
//     }

//     return `
// function templateAST(){ 
//     return ${JSON.stringify(astNodes, null, 4)}
// };

// export default templateAST;
// `.replace(/"?__solely__"?/g, "").trim();
// }
