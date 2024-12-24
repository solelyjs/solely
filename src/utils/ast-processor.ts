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
    const { styles, attrs, loops = [] } = newNode;
    if (!styles) return;

    const cssTextList: string[] = [];

    // 处理 attrs 中的 style 属性
    if (attrs?.style) {
        cssTextList.push(attrs.style);
    }

    // 获取 styles(loops) 的结果
    const stylesObj = styles(loops);

    // 处理不同类型的 stylesObj
    cssTextList.push(...flattenStyles(stylesObj));

    // 设置元素的样式
    elm.style.cssText = cssTextList.join(';');
};

const setElementClasses = (elm: HTMLElement, newNode: ASTNode): void => {
    const { classes, attrs, loops = [] } = newNode;
    if (!classes) return;

    const classesToAdd: string[] = [];

    // 处理 attrs 中的 class 属性
    if (attrs?.class) {
        classesToAdd.push(...attrs.class.split(' ').filter(cls => cls !== ''));
    }

    // 获取 classes(loops) 的结果
    const classObj = classes(loops);

    // 处理不同类型的 classObj
    classesToAdd.push(...flattenClasses(classObj));

    // 设置元素的类名
    elm.className = Array.from(new Set(classesToAdd)).join(' ');
};

// 辅助函数：处理 stylesObj 的不同情况
const flattenStyles = (stylesObj: any): string[] => {
    if (typeof stylesObj === 'object' && !Array.isArray(stylesObj)) {
        return Object.keys(stylesObj).map(key => `${key}:${stylesObj[key]}`);
    } else if (typeof stylesObj === 'string') {
        return [stylesObj];
    } else if (Array.isArray(stylesObj)) {
        return stylesObj.flatMap(item =>
            typeof item === 'string' ? [item] :
                Object.keys(item).map(key => `${key}:${item[key]}`)
        );
    }
    return [];
}

// 辅助函数：处理 classObj 的不同情况
const flattenClasses = (classObj: any): string[] => {
    if (typeof classObj === 'object' && !Array.isArray(classObj)) {
        return Object.keys(classObj).filter(key => classObj[key]).map(key => key);
    } else if (typeof classObj === 'string') {
        return classObj.split(' ').filter(cls => cls !== '');
    } else if (Array.isArray(classObj)) {
        return classObj.flatMap(item =>
            typeof item === 'string' ? item.split(' ').filter(cls => cls !== '') :
                Object.keys(item).filter(key => item[key])
        );
    }
    return [];
}

const updateElement = (oldNode: ASTNode, newNode: ASTNode): void => {
    const elm = newNode.elm as HTMLElement;
    setElementProps(elm, newNode.props, newNode.loops);
    setElementClasses(elm, newNode);
    setElementStyles(elm, newNode);
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
        case "slot":
            break;
        default:
            updateElement(oldNode, newNode);
            break;
    }
};

const insertNode = (parentNode: Node, newNode: Node, nextNode?: Node): void => {
    if (nextNode) {
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
        elm.addEventListener(key, (event: Event) => newNode.on[key](event, newNode.loops || []), false);
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

const toVNodes = (vNodes: ASTNode[], nodes: ASTNode[], loops: Loop[] = [],
    rootId: number = 0, updateId: boolean = true, isIf: boolean = false
): void => {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.tagName === 'If') {
            let isDone = false;
            const condition = node.fn?.(loops);
            if (condition) {
                toVNodes(vNodes, node.children, loops, rootId, false, true);
                isDone = true;
            }
            while (i + 1 < nodes.length && isElseIfOrComment(nodes[i + 1])) {
                const condition = nodes[i + 1].fn?.(loops);
                if (condition && !isDone) {
                    toVNodes(vNodes, nodes[i + 1].children, loops, rootId, false, true);
                    isDone = true;
                }
                i++;
            }
            if (i + 1 < nodes.length && isElse(nodes[i + 1])) {
                if (!isDone) {
                    toVNodes(vNodes, nodes[i + 1].children, loops, rootId, false, true);
                    isDone = true;
                }
                i++;
            }
        } else if (node.tagName === 'For') {
            const { item = "item", index = "index" } = node.attrs;
            const array = node.fn!(loops) || [];
            array.forEach((value: any, valueIndex: number) => {
                const loopData: Loop = { item, value, index, valueIndex };
                toVNodes(vNodes, node.children, [...loops, loopData], rootId, false);
            });
        } else {
            const newNode: ASTNode = {
                ...node,
                loops,
                children: [],
                rootId,
                isIf
            };
            toVNodes(newNode.children, node.children, loops);
            vNodes.push(newNode);
        }
        updateId && rootId++;
    }
};

const processNodes = (parentNode: Node, oldNodes: ASTNode[], newNodes: ASTNode[]): void => {
    let oldIndex = 0;
    let newIndex = 0;
    while (oldIndex < oldNodes.length && newIndex < newNodes.length) {
        const oldNode = oldNodes[oldIndex];
        const newNode = newNodes[newIndex];
        if (oldNode.rootId === newNode.rootId) {
            if (newNode.isIf) {
                (oldNode.elm as HTMLElement)?.remove();
                addNode(parentNode, newNode, oldNodes[oldIndex + 1]?.elm);
            } else {
                updateNode(oldNode, newNode);
            }
            newIndex++;
            oldIndex++;
        } else if (oldNode.rootId > newNode.rootId) {
            (oldNode.elm as HTMLElement)?.remove();
            oldIndex++;
        } else {
            addNode(parentNode, newNode, oldNodes[oldIndex + 1]?.elm);
            newIndex++;
        }
    }
    while (oldIndex < oldNodes.length) {
        const oldNode = oldNodes[oldIndex];
        (oldNode.elm as HTMLElement)?.remove();
        oldIndex++;
    }
    while (newIndex < newNodes.length) {
        const newNode = newNodes[newIndex];
        addNode(parentNode, newNode);
        newIndex++;
    }
};

export const patch = (parentNode: Element, ast: ASTNode[], oldNodes: ASTNode[] = []): ASTNode[] => {
    if (!ast || ast.length === 0) return [];
    const newNodes: ASTNode[] = [];
    toVNodes(newNodes, ast || [], [], 0, true);
    processNodes(parentNode, oldNodes, newNodes);
    // console.log(newNodes)
    return newNodes;
};