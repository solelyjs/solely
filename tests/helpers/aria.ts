/**
 * ARIA IDREF 工具：校验引用在同一棵树（document 或某个 shadow root）内可解析。
 *
 * jsdom 不构建无障碍树，因此这里只验证「ID 能否在引用方所在根节点解析」，
 * 不断言读屏输出。跨树引用（shadow 内元素引用 document 里的 id，或反向）
 * 在浏览器里不会生效，这类问题正是 F-3 的根因。
 */

/** 需要按 IDREF 解析的 ARIA 属性 */
export const IDREF_ATTRS = [
    'aria-describedby',
    'aria-labelledby',
    'aria-controls',
    'aria-owns',
    'aria-activedescendant',
    'aria-details',
    'aria-errormessage',
    'aria-flowto',
] as const;

export interface AriaIdref {
    attr: string;
    id: string;
}

/** 读取元素上全部 ARIA IDREF（支持空格分隔的多值） */
export function getAriaIdrefs(el: Element): AriaIdref[] {
    const refs: AriaIdref[] = [];
    for (const attr of IDREF_ATTRS) {
        const raw = el.getAttribute(attr);
        if (!raw) continue;
        for (const id of raw.split(/\s+/).filter(Boolean)) {
            refs.push({ attr, id });
        }
    }
    return refs;
}

/** 在给定根节点（Document / ShadowRoot / Element）内查找 id */
export function findById(root: ParentNode, id: string): Element | null {
    const escaped = id.replace(/["\\]/g, '\\$&');
    return root.querySelector(`[id="${escaped}"]`);
}

export function isIdResolvable(root: ParentNode, id: string): boolean {
    return findById(root, id) !== null;
}

export interface UnresolvableIdref extends AriaIdref {
    /** 持有该 aria-* 的元素 */
    element: Element;
}

/**
 * 扫描 root 下所有元素的 ARIA IDREF，返回无法在同一棵树内解析的引用。
 *
 * @param root 通常传 `host.shadowRoot` 或 `document`
 */
export function findUnresolvableAriaRefs(root: ParentNode): UnresolvableIdref[] {
    const failures: UnresolvableIdref[] = [];
    const elements = Array.from(root.querySelectorAll('*'));

    for (const el of elements) {
        for (const ref of getAriaIdrefs(el)) {
            if (!isIdResolvable(root, ref.id)) {
                failures.push({ ...ref, element: el });
            }
        }
    }

    return failures;
}
