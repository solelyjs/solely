import { describe, it, expect } from 'vitest';
import { isObject } from '../src/shared/is-object';

describe('isObject', () => {
    it('should return true for plain objects', () => {
        expect(isObject({})).toBe(true);
        expect(isObject({ a: 1 })).toBe(true);
        expect(isObject({ nested: { b: 2 } })).toBe(true);
    });

    it('should return true for arrays', () => {
        expect(isObject([])).toBe(true);
        expect(isObject([1, 2, 3])).toBe(true);
        expect(isObject([{ a: 1 }])).toBe(true);
    });

    it('should return false for null', () => {
        expect(isObject(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(isObject(undefined)).toBe(false);
    });

    it('should return false for primitive types', () => {
        expect(isObject(42)).toBe(false);
        expect(isObject('hello')).toBe(false);
        expect(isObject(true)).toBe(false);
        expect(isObject(false)).toBe(false);
        expect(isObject(0)).toBe(false);
        expect(isObject('')).toBe(false);
    });

    it('should return false for functions', () => {
        expect(isObject(() => {})).toBe(false);
        expect(isObject(function () {})).toBe(false);
        expect(isObject(async () => {})).toBe(false);
    });

    it('should return false for Date', () => {
        expect(isObject(new Date())).toBe(false);
    });

    it('should return false for RegExp', () => {
        expect(isObject(/test/)).toBe(false);
        expect(isObject(new RegExp('test'))).toBe(false);
    });

    it('should return false for Map and Set', () => {
        expect(isObject(new Map())).toBe(false);
        expect(isObject(new Set())).toBe(false);
    });

    it('should return false for WeakMap and WeakSet', () => {
        expect(isObject(new WeakMap())).toBe(false);
        expect(isObject(new WeakSet())).toBe(false);
    });

    it('should return false for Symbol', () => {
        expect(isObject(Symbol('test'))).toBe(false);
    });
});
