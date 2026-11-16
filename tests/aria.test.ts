/**
 * F-3 ARIA IDREF 代理基座测试
 *
 * 断言口径：jsdom 不构建无障碍树，因此用“代理 id 能否在引用方根节点内被解析”
 * 验证 IDREF 的树作用域，而不是断言读屏输出。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { assertSameTree, createAriaId, linkAria } from '../src/shared/aria';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('linkAria: 跨树代理', () => {
    it('should create a resolvable proxy in the target tree and preserve existing ids', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const source = document.createElement('span');
        source.id = 'shadow-tip';
        source.textContent = 'shadow 内的提示';
        shadow.appendChild(source);
        document.body.appendChild(host);

        const button = document.createElement('button');
        button.setAttribute('aria-describedby', 'existing-id');
        document.body.appendChild(button);

        const link = linkAria(button, 'aria-describedby', source, { role: 'tooltip' });

        expect(link.id).toBe('shadow-tip');
        expect(link.proxy).not.toBeNull();
        expect(button.getAttribute('aria-describedby')).toBe('existing-id shadow-tip');

        // document 树内出现代理；shadow 树内仍是原节点，两者 id 相同但不互相干扰
        const proxy = document.getElementById('shadow-tip');
        expect(proxy).toBe(link.proxy);
        expect(proxy!.getAttribute('role')).toBe('tooltip');
        expect(proxy!.textContent).toBe('shadow 内的提示');
        expect(shadow.querySelector('[id="shadow-tip"]')).toBe(source);

        link.release();

        expect(document.getElementById('shadow-tip')).toBeNull();
        expect(button.getAttribute('aria-describedby')).toBe('existing-id');
    });

    it('should remove the attribute entirely when it did not exist before linking', () => {
        const button = document.createElement('button');
        document.body.appendChild(button);

        const link = linkAria(button, 'aria-describedby', { id: createAriaId('tip'), content: '描述' });
        expect(button.hasAttribute('aria-describedby')).toBe(true);
        expect(document.getElementById(link.id)).toBe(link.proxy);

        link.release();
        expect(button.hasAttribute('aria-describedby')).toBe(false);
        expect(document.getElementById(link.id)).toBeNull();
    });

    it('should keep the proxy alive while another link shares the same id', () => {
        const first = document.createElement('button');
        const second = document.createElement('button');
        document.body.append(first, second);

        const linkA = linkAria(first, 'aria-describedby', { id: 'shared-tip', content: '共享' });
        const linkB = linkAria(second, 'aria-describedby', { id: 'shared-tip', content: '共享' });

        expect(document.querySelectorAll('[id="shared-tip"]').length).toBe(1);
        expect(linkA.proxy).toBe(linkB.proxy);

        linkA.release();
        expect(document.querySelectorAll('[id="shared-tip"]').length).toBe(1);
        expect(second.getAttribute('aria-describedby')).toBe('shared-tip');

        linkB.release();
        expect(document.querySelectorAll('[id="shared-tip"]').length).toBe(0);
        expect(first.hasAttribute('aria-describedby')).toBe(false);
    });

    it('should update proxy content without recreating the node', () => {
        const button = document.createElement('button');
        document.body.appendChild(button);

        const link = linkAria(button, 'aria-describedby', { id: 'live-tip', role: 'tooltip', content: '旧内容' });
        const proxy = link.proxy;

        link.update('新内容', 'tooltip');
        expect(link.proxy).toBe(proxy);
        expect(link.proxy!.textContent).toBe('新内容');

        link.release();
        expect(document.getElementById('live-tip')).toBeNull();
    });
});

describe('linkAria: 同树快捷键', () => {
    it('should reference the real node without creating a duplicate id', () => {
        const source = document.createElement('span');
        source.id = 'same-tree-label';
        source.textContent = '标签';
        const button = document.createElement('button');
        document.body.append(source, button);

        const link = linkAria(button, 'aria-labelledby', source);

        expect(link.proxy).toBeNull();
        expect(button.getAttribute('aria-labelledby')).toBe('same-tree-label');
        expect(document.querySelectorAll('[id="same-tree-label"]').length).toBe(1);
        expect(assertSameTree(button, source)).toBe(true);

        link.release();
        expect(button.hasAttribute('aria-labelledby')).toBe(false);
        expect(source.isConnected).toBe(true);
    });

    it('should assign an id to a same-tree source that has none', () => {
        const source = document.createElement('span');
        source.textContent = '标签';
        const button = document.createElement('button');
        document.body.append(source, button);

        const link = linkAria(button, 'aria-labelledby', source);
        expect(source.id).toBe(link.id);
        expect(button.getAttribute('aria-labelledby')).toBe(link.id);

        link.release();
        expect(button.hasAttribute('aria-labelledby')).toBe(false);
    });
});

describe('linkAria: 单值 IDREF', () => {
    it('should override aria-activedescendant while linked and restore the original value', () => {
        const button = document.createElement('button');
        button.setAttribute('aria-activedescendant', 'user-item');
        document.body.appendChild(button);

        const first = linkAria(button, 'aria-activedescendant', { id: 'option-a', content: '选项 A' });
        expect(button.getAttribute('aria-activedescendant')).toBe('option-a');

        const second = linkAria(button, 'aria-activedescendant', { id: 'option-b', content: '选项 B' });
        expect(button.getAttribute('aria-activedescendant')).toBe('option-b');

        second.release();
        expect(button.getAttribute('aria-activedescendant')).toBe('option-a');

        first.release();
        expect(button.getAttribute('aria-activedescendant')).toBe('user-item');
        expect(document.getElementById('option-a')).toBeNull();
        expect(document.getElementById('option-b')).toBeNull();
    });
});

describe('linkAria: 容器选择', () => {
    it('should insert the proxy into the shadow root that owns the target', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const button = document.createElement('button');
        shadow.appendChild(button);
        document.body.appendChild(host);

        const link = linkAria(button, 'aria-describedby', { id: 'inner-tip', content: 'shadow 内按钮的描述' });

        expect(button.getAttribute('aria-describedby')).toBe('inner-tip');
        // 代理必须与引用方同树：document 查不到，目标 shadow root 能查到
        expect(document.getElementById('inner-tip')).toBeNull();
        expect(shadow.querySelector('[id="inner-tip"]')).toBe(link.proxy);

        link.release();
        expect(shadow.querySelector('[id="inner-tip"]')).toBeNull();
    });

    it('should resolve a Document root by nodeType instead of instanceof', () => {
        const button = document.createElement('button');
        document.body.appendChild(button);

        // 伪造一个 nodeType=9、但不是 Document 实例的根节点（等价于跨 realm 的 Document）
        const fakeBody = document.createElement('section');
        document.body.appendChild(fakeBody);
        const fakeRoot = { nodeType: 9, body: fakeBody };
        (button as unknown as { getRootNode: () => Node }).getRootNode = () => fakeRoot as unknown as Node;

        const link = linkAria(button, 'aria-describedby', { id: 'fake-root-tip', content: '跨 realm 描述' });

        // 只验证 nodeType=9 分支被命中：代理被写入 fakeRoot.body
        expect(fakeBody.querySelector('[id="fake-root-tip"]')).toBe(link.proxy);

        link.release();
        expect(fakeBody.querySelector('[id="fake-root-tip"]')).toBeNull();
    });
});

describe('linkAria: 多 link 叠加还原', () => {
    it('should remove only its own id when releasing one of several links', () => {
        const button = document.createElement('button');
        button.setAttribute('aria-describedby', 'original');
        document.body.appendChild(button);

        const first = linkAria(button, 'aria-describedby', { id: 'add-a', content: 'A' });
        const second = linkAria(button, 'aria-describedby', { id: 'add-b', content: 'B' });
        expect(button.getAttribute('aria-describedby')).toBe('original add-a add-b');

        first.release();
        expect(button.getAttribute('aria-describedby')).toBe('original add-b');
        expect(document.getElementById('add-a')).toBeNull();
        expect(document.getElementById('add-b')).not.toBeNull();

        second.release();
        expect(button.getAttribute('aria-describedby')).toBe('original');
        expect(document.getElementById('add-b')).toBeNull();
    });
});
