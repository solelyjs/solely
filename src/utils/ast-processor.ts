import { Loop, ASTNode } from "./html-parse";
const xlinkNS = "http://www.w3.org/1999/xlink";
const xmlnsNS = "http://www.w3.org/2000/xmlns/";
const xmlNS = "http://www.w3.org/XML/1998/namespace";
const svgNS = "http://www.w3.org/2000/svg";

const getContent = (newNode: ASTNode): string => {
    if (typeof newNode.content === 'function') {
        return newNode.content(newNode.loops || []);
    }
    return newNode.content || '';
};

const updateText = (newNode: ASTNode): void => {
    const content = getContent(newNode);
    const elm = newNode.elm as Node;
    if (elm.textContent !== content) {
        elm.textContent = content;
    }
};

const setElementProps = (elm: HTMLElement, props: Record<string, Function>, loops: Loop[] = []): void => {
    Object.keys(props).forEach(key => {
        const value = props[key](loops);
        if ((elm as any)[key] !== value) {
            (elm as any)[key] = value;
        }
    });
};

const setElementStyles = (elm: HTMLElement, newNode: ASTNode): void => {
    const { styles, loops = [] } = newNode;
    if (!styles) return;

    // 获取 styles(loops) 的结果
    const stylesObj = styles(loops);

    const styleDict = flattenStyle(stylesObj);
    Object.entries(styleDict).forEach(([key, value]) => {
        (elm.style as any)[key] = value;
    });
};

const setElementClasses = (elm: HTMLElement, newNode: ASTNode): void => {
    const { classes, loops = [] } = newNode;
    if (!classes) return;

    // 获取 classes(loops) 的结果
    const classObj = classes(loops);

    const classDict = flattenClasses(classObj);

    Object.entries(classDict).forEach(([key, value]) => {
        if (value) {
            elm.classList.add(key);
        } else {
            elm.classList.remove(key);
        }
    });
};

// 辅助函数：处理 styleObj 的不同情况并返回 k-v 结构的对象
const flattenStyle = (styleObj: any): Record<string, string> => {
    let result: Record<string, string> = {};

    if (typeof styleObj === 'object' && styleObj !== null && !Array.isArray(styleObj)) {
        Object.entries(styleObj).forEach(([key, value]) => {
            // 检查值是否为对象，如果是，则递归调用 flattenStyle
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const nestedStyle = flattenStyle(value);
                Object.entries(nestedStyle).forEach(([subKey, subValue]) => {
                    result[`${key}-${subKey}`] = subValue;
                });
            } else if (typeof value === 'string' || typeof value === 'number') {
                // 如果值是字符串或数字，直接添加到结果对象
                result[key] = `${value}`;
            } else {
                // 如果值不是字符串或数字，转换为字符串
                result[key] = String(value);
            }
        });
    } else if (typeof styleObj === 'string') {
        // 将字符串形式的样式转换为对象
        styleObj.split(';').forEach(rule => {
            const [prop, value] = rule.split(':').map(part => part.trim());
            if (prop && value) result[prop] = value;
        });
    } else if (Array.isArray(styleObj)) {
        // 处理数组中的每个元素
        styleObj.forEach(item => {
            const flatItem = flattenStyle(item);
            Object.entries(flatItem).forEach(([key, value]) => {
                result[key] = value;
            });
        });
    }

    return result;
};

// 辅助函数：处理 classObj 的不同情况并返回 k-v 结构的对象
const flattenClasses = (classObj: any): Record<string, boolean> => {
    let result: Record<string, boolean> = {};

    if (typeof classObj === 'object' && !Array.isArray(classObj)) {
        Object.entries(classObj).forEach(([key, value]) => {
            result[key] = !!value;
        });
    } else if (typeof classObj === 'string') {
        classObj.split(' ').forEach(cls => {
            if (cls !== '') result[cls] = true;
        });
    } else if (Array.isArray(classObj)) {
        classObj.forEach(item => {
            const flatItem = flattenClasses(item);
            Object.entries(flatItem).forEach(([key, value]) => {
                result[key] = value;
            });
        });
    }

    return result;
};

const addEventHandler = (elm: HTMLElement, key: string, newNode: ASTNode): void => {
    const eventHandler = (event: Event) => newNode.on[key](event, newNode.loops || []);
    elm.addEventListener(key, eventHandler, false);
    newNode.handlers = newNode.handlers || {};
    newNode.handlers[key] = eventHandler;
}

const updateElement = (oldNode: ASTNode, newNode: ASTNode): void => {
    const elm = newNode.elm as HTMLElement;
    // 更新事件监听器
    Object.keys(newNode.on).forEach(key => {
        if (oldNode.handlers && oldNode.handlers[key]) {
            elm.removeEventListener(key, oldNode.handlers[key], false);
        }
        addEventHandler(elm, key, newNode);
    });

    setElementProps(elm, newNode.props, newNode.loops);
    setElementClasses(elm, newNode);
    setElementStyles(elm, newNode);

    // ---- 生命周期钩子 ----
    if (typeof newNode.onUpdated === 'function') {
        requestAnimationFrame(() => {
            newNode.onUpdated!(elm, newNode.loops || []);
        });
    }

    processNodes(elm, oldNode.children, newNode.children);
};

const updateNode = (oldNode: ASTNode, newNode: ASTNode): void => {
    newNode.elm = oldNode.elm;
    switch (newNode.tagName) {
        case "comment":
            break;
        case "text":
            updateText(newNode);
            break;
        // case "slot":
        //     break;
        default:
            updateElement(oldNode, newNode);
            break;
    }
};

const insertNode = (parentNode: Node, newNode: Node, nextNode?: Node): void => {
    if (nextNode && nextNode.parentNode === parentNode) {
        parentNode.insertBefore(newNode, nextNode);
    } else {
        parentNode.appendChild(newNode);
    }
};

const addText = (parentNode: Node, newNode: ASTNode, nextNode?: Node): void => {
    const content = getContent(newNode);
    const textNode = document.createTextNode(content);
    newNode.elm = textNode;
    insertNode(parentNode, textNode, nextNode);
};

const addComment = (parentNode: Node, newNode: ASTNode, nextNode?: Node): void => {
    const content = newNode.content as string;
    const commentNode = document.createComment(content);
    newNode.elm = commentNode;
    insertNode(parentNode, commentNode, nextNode);
};

const addElement = (parentNode: Node, newNode: ASTNode, nextNode?: Node, ns?: string): void => {
    if (newNode.tagName === 'svg') {
        ns = svgNS;
    }
    const elm = ns ? document.createElementNS(ns, newNode.tagName) : document.createElement(newNode.tagName);
    Object.keys(newNode.attrs).forEach(key => {
        const value = newNode.attrs[key] || '';
        if (key.charAt(0) !== 'x') {
            elm.setAttribute(key, value);
        } else if (key.startsWith('xml:')) {
            elm.setAttributeNS(xmlNS, key, value);
        } else if (key.startsWith('xlink:')) {
            elm.setAttributeNS(xlinkNS, key, value);
        } else if (key.startsWith('xmlns:')) {
            elm.setAttributeNS(xmlnsNS, key, value);
        } else {
            elm.setAttribute(key, value);
        }
    });
    Object.keys(newNode.on).forEach(key => {
        addEventHandler(elm as HTMLElement, key, newNode);
    });
    setElementProps(elm as HTMLElement, newNode.props, newNode.loops);
    setElementClasses(elm as HTMLElement, newNode);
    setElementStyles(elm as HTMLElement, newNode);
    newNode.elm = elm;
    insertNode(parentNode, elm, nextNode);

    // reset namespace
    if (newNode.tagName === 'foreignObject') {
        ns = void 0;
    }

    newNode.children.forEach(childNode => {
        addNode(elm, childNode, void 0, ns);
    });

    // ---- 生命周期钩子 ----
    if (typeof newNode.onMounted === 'function') {
        // 延迟到下一帧，确保布局完成、clientWidth等可用
        requestAnimationFrame(() => {
            newNode.onMounted!(elm as HTMLElement, newNode.loops || []);
        });
    }
};

const addNode = (parentNode: Node, newNode: ASTNode, nextNode?: Node, ns?: string): void => {
    switch (newNode.tagName) {
        case "comment":
            addComment(parentNode, newNode, nextNode);
            break;
        case "text":
            addText(parentNode, newNode, nextNode);
            break;
        default:
            addElement(parentNode, newNode, nextNode, ns);
            break;
    }
};

const isElseIfOrComment = (node: ASTNode): boolean => node && (node.tagName === 'ElseIf' || node.tagName === 'comment');
const isElse = (node: ASTNode): boolean => node && (node.tagName === 'Else');
const toVNodes = (vNodes: ASTNode[], nodes: ASTNode[], loops: Loop[] = [], rootId: string = "0", ifId?: number): void => {
    let ifGroupId = 0; // 跟踪当前父节点下的 If 组数量
    let forGroupId = 0; // 跟踪当前父节点下的 For 组数量
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.tagName === 'If') {
            let isDone = false;
            ifGroupId++; // 每遇到一个新的 If 节点，ifGroupId 递增
            let ifId = 1;
            const condition = node.fn?.(loops);
            if (condition) {
                toVNodes(vNodes, node.children, loops, `${rootId}-if-${ifGroupId}-${ifId}`, ifId);
                isDone = true;
            }
            ifId++;
            while (i + 1 < nodes.length && isElseIfOrComment(nodes[i + 1])) {
                const condition = nodes[i + 1].fn?.(loops);
                if (condition && !isDone) {
                    toVNodes(vNodes, nodes[i + 1].children, loops, `${rootId}-if-${ifGroupId}-${ifId}`, ifId);
                    isDone = true;
                }
                i++;
                ifId++;
            }
            if (i + 1 < nodes.length && isElse(nodes[i + 1])) {
                if (!isDone) {
                    toVNodes(vNodes, nodes[i + 1].children, loops, `${rootId}-if-${ifGroupId}-${ifId}`, ifId);
                    isDone = true;
                }
                i++;
            }
        } else if (node.tagName === 'For') {
            forGroupId++; // 每遇到一个新的 For 节点，forGroupId 递增
            const { item = "item", index = "index" } = node.attrs;
            const array = node.fn!(loops) || [];
            array.forEach((value: any, valueIndex: number) => {
                const loopData: Loop = { item, value, index, valueIndex };
                toVNodes(vNodes, node.children, [...loops, loopData], `${rootId}-for-${forGroupId}-${valueIndex}`, 1); //重置ifId
            });
        } else {
            const newNode: ASTNode = {
                ...node,
                loops,
                children: [],
                rootId,
                ifId,
                key: node.key || `${rootId}-${i}` // 添加 key 属性
            };
            toVNodes(newNode.children, node.children, loops, `${rootId}-${i}`);
            vNodes.push(newNode);
        }
    }
};

const processNodes = (parentNode: Node, oldNodes: ASTNode[], newNodes: ASTNode[]): void => {
    const oldMap = new Map();
    oldNodes.forEach((node, index) => oldMap.set(node.key, { node, index }));

    let newIndex = 0;
    let oldIndex = 0;
    while (newIndex < newNodes.length) {
        const newNode = newNodes[newIndex];
        const oldMatch = oldMap.get(newNode.key);

        if (oldMatch) {
            const oldNode = oldMatch.node;

            // 如果 tagName 发生变化 —— 直接删除旧 DOM 并创建新 DOM（保证命名空间/类型正确）
            if (oldNode.tagName !== newNode.tagName) {
                // 移除旧节点的 DOM（会移除其子树和事件绑定）
                (oldNode.elm as HTMLElement | null)?.remove();

                // 在当前位置插入 newNode（使用 oldNodes[oldIndex + 1]?.elm 作为 nextNode）
                const nextNode = oldNodes[oldIndex + 1]?.elm;
                addNode(parentNode, newNode, nextNode);

                // 从映射中移除已处理的旧节点
                oldMap.delete(newNode.key);

                // 保持 oldIndex 与 newIndex 的推进（我们替换了当前位置）
                oldIndex++;
            } else {
                // 如果 ifId 变了（条件分支替换）需要整体替换 DOM
                if (newNode.ifId && oldNode.ifId !== newNode.ifId) {
                    (oldNode.elm as HTMLElement | null)?.remove();
                    const nextNode = oldNodes[oldIndex + 1]?.elm;
                    addNode(parentNode, newNode, nextNode);
                } else {
                    updateNode(oldNode, newNode);
                }
                oldMap.delete(newNode.key);
                oldIndex++;
            }
        } else {
            const nextNode = oldNodes[oldIndex]?.elm;
            addNode(parentNode, newNode, nextNode);
        }
        newIndex++;
    }

    oldMap.forEach(({ node }) => (node.elm as HTMLElement | null)?.remove());
};


export const patch = (parentNode: Element | ShadowRoot, ast: ASTNode[], oldNodes: ASTNode[] = []): ASTNode[] => {
    if (!ast || ast.length === 0) return [];
    const newNodes: ASTNode[] = [];
    toVNodes(newNodes, ast || [], [], "0");
    processNodes(parentNode, oldNodes, newNodes);
    return newNodes;
};