import { describe, it, expect } from 'vitest';
import { genFunction, GenType } from '../src/shared/gen-function';

function callWithScope(fn: Function, thisArg: Record<string, unknown>, args: unknown[] = []) {
    return fn.apply(thisArg, args);
}

describe('genFunction', () => {
    describe('template type', () => {
        it('should generate a template string function', () => {
            const fn = genFunction('Hello {{ $data.name }}', 'template', []);
            const result = callWithScope(fn, { $data: { name: 'World' } }, [[]]);
            expect(result).toBe('Hello World');
        });

        it('should handle expressions in interpolation', () => {
            const fn = genFunction('Result: {{ $data.a + $data.b }}', 'template', []);
            const result = callWithScope(fn, { $data: { a: 1, b: 2 } }, [[]]);
            expect(result).toBe('Result: 3');
        });

        it('should handle templates without interpolation', () => {
            const fn = genFunction('static text', 'template', []);
            const result = callWithScope(fn, {}, [[]]);
            expect(result).toBe('static text');
        });

        it('should handle empty template', () => {
            const fn = genFunction('', 'template', []);
            expect(typeof fn).toBe('function');
        });

        it('should handle unknown type gracefully', () => {
            const fn = genFunction('x', 'unknown' as GenType, []);
            expect(typeof fn).toBe('function');
            const result = callWithScope(fn, {}, [[]]);
            expect(result).toBeUndefined();
        });
    });

    describe('expression type', () => {
        it('should evaluate and return expression result', () => {
            const fn = genFunction('1 + 2', 'expression', []);
            const result = callWithScope(fn, {}, [[]]);
            expect(result).toBe(3);
        });

        it('should access $data in expression', () => {
            const fn = genFunction('$data.count + 10', 'expression', []);
            const result = callWithScope(fn, { $data: { count: 5 } }, [[]]);
            expect(result).toBe(15);
        });

        it('should handle boolean expressions', () => {
            const fn = genFunction('$data.active && $data.ready', 'expression', []);
            const result = callWithScope(fn, { $data: { active: true, ready: true } }, [[]]);
            expect(result).toBe(true);
        });
    });

    describe('handler type', () => {
        it('should execute handler code', () => {
            const fn = genFunction('$data.count = 42', 'handler', []);
            const scope = { $data: { count: 0 } };
            callWithScope(fn, scope);
            expect((scope.$data as Record<string, number>).count).toBe(42);
        });

        it('should have event, value, checked available', () => {
            const fn = genFunction('$data.targetValue = value', 'handler', []);
            const scope = { $data: { targetValue: '' } };
            callWithScope(fn, scope, [{ target: { value: 'hello' } }]);
            expect((scope.$data as Record<string, string>).targetValue).toBe('hello');
        });
    });

    describe('lifecycle type', () => {
        it('should execute lifecycle code with el parameter', () => {
            const fn = genFunction('$data.elTagName = el.tagName', 'lifecycle', []);
            const scope = { $data: { elTagName: '' } };
            callWithScope(fn, scope, [document.createElement('div')]);
            expect((scope.$data as Record<string, string>).elTagName).toBe('DIV');
        });
    });

    describe('locals (loop variables)', () => {
        it('should support loop item variable', () => {
            const fn = genFunction('{{ item }}', 'template', [{ i: 'item', x: 'idx' }]);
            const loopItem = { itmVal: 'apple', idxVal: 0 };
            const result = callWithScope(fn, { $data: {} }, [[loopItem]]);
            expect(result).toBe('apple');
        });

        it('should support loop index variable', () => {
            const fn = genFunction('{{ idx }}', 'template', [{ i: 'item', x: 'idx' }]);
            const loopItem = { itmVal: 'apple', idxVal: 3 };
            const result = callWithScope(fn, { $data: {} }, [[loopItem]]);
            expect(result).toBe('3');
        });

        it('should support nested loop locals', () => {
            const fn = genFunction('{{ outer }} {{ inner }}', 'template', [
                { i: 'outer', x: 'oIdx' },
                { i: 'inner', x: 'iIdx' },
            ]);
            const result = callWithScope(fn, { $data: {} }, [
                [
                    { itmVal: 'A', idxVal: 0 },
                    { itmVal: 'B', idxVal: 0 },
                ],
            ]);
            expect(result).toBe('A B');
        });
    });

    describe('error handling', () => {
        it('should throw on triple brace interpolation', () => {
            const fn = genFunction('{{{ bad }}}', 'template', []);
            expect(() => callWithScope(fn, { $data: {} }, [[]])).toThrow();
        });

        it('should handle empty code gracefully', () => {
            const fn = genFunction('', 'template', []);
            expect(typeof fn).toBe('function');
        });

        it('should return safe wrapper on parse error', () => {
            const fn = genFunction('${invalid syntax}', 'expression', []);
            expect(typeof fn).toBe('function');
            expect(() => callWithScope(fn, {}, [[]])).toThrow();
        });
    });
});
