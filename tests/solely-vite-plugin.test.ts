import { describe, it, expect, vi } from 'vitest';
import { solelyVitePlugin, compileTemplate } from '../src/plugins/solely-vite-plugin';

describe('solely-vite-plugin', () => {
    describe('compileTemplate', () => {
        it('should compile HTML to IR', () => {
            const html = '<div class="container">Hello</div>';
            const ir = compileTemplate(html, 'test.html');

            expect(ir.t).toBe('root');
            expect(ir.v).toBeDefined();
            expect(ir.n).toHaveLength(1);
            expect(ir.n[0].g).toBe('div');
            expect(ir.s).toBeDefined();
            expect(ir.m).toBeDefined();
        });

        it('should handle empty HTML', () => {
            const ir = compileTemplate('', 'empty.html');
            expect(ir.n).toHaveLength(0);
        });

        it('should handle complex template', () => {
            const html = `
                <div>
                    <h1>{{ $data.title }}</h1>
                    <p s-if="$data.show">{{ $data.content }}</p>
                </div>
            `;
            const ir = compileTemplate(html, 'complex.html');

            expect(ir.n).toHaveLength(1);
            expect(ir.n[0].g).toBe('div');
            expect(ir.n[0].c).toBeDefined();
            expect(ir.n[0].c!.length).toBeGreaterThan(0);
        });
    });

    describe('plugin', () => {
        it('should create plugin with default options', () => {
            const plugin = solelyVitePlugin();

            expect(plugin.name).toBe('solely-vite-plugin');
            expect(plugin.enforce).toBe('pre');
        });

        it('should create plugin with custom options', () => {
            const plugin = solelyVitePlugin({
                precompile: false,
                debug: true,
                minify: true,
            });

            expect(plugin.name).toBe('solely-vite-plugin');
        });

        it('should transform .html?solely files', () => {
            const plugin = solelyVitePlugin();
            const code = '<div>Hello</div>';
            const id = 'test.html?solely';

            const result = (plugin.transform as Function)(code, id);

            expect(result).not.toBeNull();
            expect(result.code).toContain('__SOLELY_IR__');
            expect(result.code).toContain("t: 'root'");
        });

        it('should return null for non-matching files', () => {
            const plugin = solelyVitePlugin();

            expect((plugin.transform as Function)('code', 'test.js')).toBeNull();
            expect((plugin.transform as Function)('code', 'test.css')).toBeNull();
            expect((plugin.transform as Function)('code', 'test.html')).toBeNull();
        });

        it('should return null for excluded files', () => {
            const plugin = solelyVitePlugin();
            const code = '<div>Hello</div>';
            const id = 'node_modules/test.html?solely';

            const result = (plugin.transform as Function)(code, id);
            expect(result).toBeNull();
        });

        it('should handle non-precompile mode', () => {
            const plugin = solelyVitePlugin({ precompile: false });
            const code = '<div>Hello</div>';
            const id = 'test.html?solely';

            const result = (plugin.transform as Function)(code, id);

            expect(result).not.toBeNull();
            expect(result.code).toContain('__SOLELY_TEMPLATE__');
            expect(result.code).toContain('Hello');
        });

        it('should handle minify mode', () => {
            const plugin = solelyVitePlugin({ minify: true });
            const code = '<div>Hello</div>';
            const id = 'test.html?solely';

            const result = (plugin.transform as Function)(code, id);

            expect(result).not.toBeNull();
            // Minified code should not contain banner
            expect(result.code).not.toContain('Solely Precompiled Template');
        });

        it('should handle transform errors gracefully', () => {
            const plugin = solelyVitePlugin();
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            // Invalid HTML that causes parse error
            const code = '<div><unclosed';
            const id = 'test.html?solely';

            const result = (plugin.transform as Function)(code, id);

            expect(result).not.toBeNull();
            expect(result.code).toContain('__SOLELY_TEMPLATE__');

            consoleSpy.mockRestore();
            consoleWarnSpy.mockRestore();
        });

        it('should disable sourceMap when sourceMap option is false', () => {
            const plugin = solelyVitePlugin({ sourceMap: false });
            const code = '<div>Hello</div>';
            const id = 'test.html?solely';

            const result = (plugin.transform as Function)(code, id);

            expect(result).not.toBeNull();
            expect(result.map).toBeNull();
        });

        it('should handle HMR for matching files', () => {
            const plugin = solelyVitePlugin();
            const sendMock = vi.fn();
            const modules = new Set();

            const result = (plugin.handleHotUpdate as Function)({
                file: 'test.html',
                server: { ws: { send: sendMock } },
                modules,
            });

            expect(sendMock).toHaveBeenCalledWith({
                type: 'full-reload',
                path: '*',
            });
            expect(result).toBe(modules);
        });

        it('should not handle HMR for non-matching files', () => {
            const plugin = solelyVitePlugin();
            const sendMock = vi.fn();

            const result = (plugin.handleHotUpdate as Function)({
                file: 'test.js',
                server: { ws: { send: sendMock } },
                modules: new Set(),
            });

            expect(sendMock).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
        });

        it('should log debug info when debug is enabled', () => {
            const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
            const plugin = solelyVitePlugin({ debug: true });

            (plugin.configResolved as Function)({});
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });
});
