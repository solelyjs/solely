import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Router } from '../src/router/core';

// Use a mutable container so vi.mock factory can reference it safely
const mockContainer: { router: Router | null } = { router: null };

vi.mock('../src/router/core', async () => {
    const actual = await vi.importActual<typeof import('../src/router/core')>('../src/router/core');
    return {
        ...actual,
        get routerReady() {
            const router = mockContainer.router!;
            const callable = () => Promise.resolve(router);
            return Object.assign(callable, {
                then: (onfulfilled?: any, onrejected?: any) => Promise.resolve(router).then(onfulfilled, onrejected),
                catch: (onrejected?: any) => Promise.resolve(router).catch(onrejected),
                finally: (onfinally?: any) => Promise.resolve(router).finally(onfinally),
                [Symbol.toStringTag]: 'Promise',
            });
        },
        getRouter() {
            return mockContainer.router;
        },
    };
});

// Import RouterLink after mock setup
import RouterLink from '../src/router/router-link';

describe('router-link', () => {
    beforeEach(() => {
        mockContainer.router = {
            getCurrentRoute: vi.fn(() => ({ fullPath: '/home', params: {}, query: {}, matched: [] })),
            push: vi.fn(),
            resolve: vi.fn((to: string) => to),
            prefetch: vi.fn(),
            listen: vi.fn(() => () => {}),
        } as unknown as Router;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create router-link element', () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        expect(el.tagName.toLowerCase()).toBe('router-link');
        el.remove();
    });

    it('should update href based on to attribute', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockContainer.router!.resolve).toHaveBeenCalledWith('/about');
        el.remove();
    });

    it('should mark as active when route matches', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/about',
            params: {},
            query: {},
            matched: [],
        });

        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.classList.contains('active')).toBe(true);
        el.remove();
    });

    it('should not mark as active when route does not match', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/contact');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.classList.contains('active')).toBe(false);
        el.remove();
    });

    it('should mark a non-exact link as active when only the query differs', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/about?tab=details',
            params: {},
            query: { tab: 'details' },
            matched: [],
        });

        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.classList.contains('active')).toBe(true);
        el.remove();
    });

    it('should handle exact matching', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/about/team',
            params: {},
            query: {},
            matched: [],
        });

        const el = new RouterLink();
        el.setAttribute('to', '/about');
        el.setAttribute('exact', '');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.classList.contains('active')).toBe(false);
        el.remove();
    });

    it('should handle active prop override', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        (el as any).active = true;
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.classList.contains('active')).toBe(true);
        el.remove();
    });

    it('should call router.push on click', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        el.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));

        expect(mockContainer.router!.push).toHaveBeenCalledWith('/about');
        el.remove();
    });

    it('should not intercept click with modifier keys', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        el.dispatchEvent(new MouseEvent('click', { button: 0, ctrlKey: true, bubbles: true }));

        expect(mockContainer.router!.push).not.toHaveBeenCalled();
        el.remove();
    });

    it('should not intercept non-left click', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        el.dispatchEvent(new MouseEvent('click', { button: 1, bubbles: true }));

        expect(mockContainer.router!.push).not.toHaveBeenCalled();
        el.remove();
    });

    it('should use custom active class', async () => {
        (mockContainer.router!.getCurrentRoute as ReturnType<typeof vi.fn>).mockReturnValue({
            fullPath: '/about',
            params: {},
            query: {},
            matched: [],
        });

        const el = new RouterLink();
        el.setAttribute('to', '/about');
        el.setAttribute('active-class', 'custom-active');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.classList.contains('custom-active')).toBe(true);
        el.remove();
    });

    it('should prefetch on mouseenter when prefetch attribute is set', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        el.setAttribute('prefetch', '');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

        expect(mockContainer.router!.prefetch).toHaveBeenCalledWith('/about');
        el.remove();
    });

    it('should render label as fallback', async () => {
        const el = new RouterLink();
        el.setAttribute('to', '/about');
        el.setAttribute('label', 'About Us');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(el.shadowRoot?.textContent).toContain('About Us');
        el.remove();
    });

    it('should unsubscribe from the router when disconnected', async () => {
        const unsubscribe = vi.fn();
        (mockContainer.router!.listen as ReturnType<typeof vi.fn>).mockReturnValue(unsubscribe);

        const el = new RouterLink();
        el.setAttribute('to', '/about');
        document.body.appendChild(el);

        await new Promise(resolve => setTimeout(resolve, 10));
        el.remove();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
