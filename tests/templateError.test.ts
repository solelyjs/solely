import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showTemplateError } from '../src/shared/templateError';

describe('showTemplateError', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
    let consoleGroupCollapsedSpy: ReturnType<typeof vi.spyOn>;
    let consoleGroupEndSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        consoleGroupCollapsedSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should log error with component name and message', () => {
        showTemplateError(new Error('test error'), '', undefined, 'MyComponent');

        expect(consoleErrorSpy).toHaveBeenCalled();
        const callArgs = consoleErrorSpy.mock.calls[0] as unknown[];
        expect(callArgs[0]).toContain('Template Error');
        expect(callArgs[0]).toContain('MyComponent');
        expect(callArgs[0]).toContain('test error');
    });

    it('should log expression when meta.expr is provided without location', () => {
        showTemplateError(new Error('test error'), '', { expr: 'user.name' }, 'MyComponent');

        expect(consoleInfoSpy).toHaveBeenCalled();
        const infoCalls = consoleInfoSpy.mock.calls as unknown[][];
        const exprCall = infoCalls.find(c => typeof c[0] === 'string' && c[0].includes('Expression:'));
        expect(exprCall).toBeDefined();
    });

    it('should log error with source location', () => {
        const source = 'line1\nline2\nline3\nline4\nline5';
        const meta = { expr: 'bad.expr', loc: [3, 2] as [number, number] };

        showTemplateError(new Error('test error'), source, meta, 'MyComponent');

        expect(consoleGroupCollapsedSpy).toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalled();
        expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it('should handle line number out of range', () => {
        const source = 'line1\nline2';
        const meta = { expr: 'bad.expr', loc: [10, 1] as [number, number] };

        showTemplateError(new Error('test error'), source, meta, 'MyComponent');

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('超出范围'));
    });

    it('should handle multi-line expressions', () => {
        const source = 'line1\nline2\nline3\nline4\nline5';
        const meta = { expr: 'fn(\n  arg1,\n  arg2\n)', loc: [2, 1] as [number, number] };

        showTemplateError(new Error('test error'), source, meta, 'MyComponent');

        expect(consoleGroupCollapsedSpy).toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should handle string error input', () => {
        showTemplateError('string error', '', undefined, 'MyComponent');

        expect(consoleErrorSpy).toHaveBeenCalled();
        const callArgs = consoleErrorSpy.mock.calls[0] as unknown[];
        expect(callArgs[0]).toContain('string error');
    });

    it('should handle negative line numbers', () => {
        const source = 'line1\nline2\nline3';
        const meta = { expr: 'bad.expr', loc: [-1, -1] as [number, number] };

        showTemplateError(new Error('test error'), source, meta, 'MyComponent');

        expect(consoleGroupCollapsedSpy).toHaveBeenCalled();
    });

    it('should handle empty source', () => {
        showTemplateError(
            new Error('test error'),
            '',
            { expr: 'bad.expr', loc: [1, 1] as [number, number] },
            'MyComponent',
        );

        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle missing meta.loc', () => {
        showTemplateError(new Error('test error'), 'source code', { expr: 'bad.expr' }, 'MyComponent');

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(consoleGroupCollapsedSpy).not.toHaveBeenCalled();
    });

    it('should handle tab characters in source', () => {
        const source = 'line1\n\t\tindented\nline3';
        const meta = { expr: 'bad.expr', loc: [2, 3] as [number, number] };

        showTemplateError(new Error('test error'), source, meta, 'MyComponent');

        expect(consoleGroupCollapsedSpy).toHaveBeenCalled();
    });

    it('should handle unicode characters in source', () => {
        const source = 'line1\n中文内容\nline3';
        const meta = { expr: 'bad.expr', loc: [2, 1] as [number, number] };

        showTemplateError(new Error('test error'), source, meta, 'MyComponent');

        expect(consoleGroupCollapsedSpy).toHaveBeenCalled();
    });
});
