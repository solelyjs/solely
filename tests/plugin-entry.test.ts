import { describe, it, expect } from 'vitest';
import pluginDefault, { solelyVitePlugin } from '../src/plugin';

describe('solely/plugin entry', () => {
    it('should expose the vite plugin from the public entry', () => {
        expect(typeof solelyVitePlugin).toBe('function');
        expect(pluginDefault).toBe(solelyVitePlugin);
    });

    it('should create a valid plugin instance', () => {
        const plugin = solelyVitePlugin();
        expect(plugin.name).toBe('solely-vite-plugin');
    });
});
