module.exports = {
    root: true,
    env: {
        browser: true,
        es2021: true,
        node: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint'],
    rules: {
        // 基础规则
        'indent': ['error', 4, { 'SwitchCase': 1 }],
        'linebreak-style': 'off',
        'quotes': 'off',
        'semi': ['error', 'always'],
        'max-len': ['warn', { 'code': 120 }],

        // TypeScript 规则
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',

        // 最佳实践
        'no-console': ['warn', { 'allow': ['warn', 'error'] }],
        'no-debugger': 'error',
        'no-case-declarations': 'off',
        'no-prototype-builtins': 'off',
        'no-useless-escape': 'off',
        'prefer-const': 'error',
        'no-var': 'error',
        '@typescript-eslint/no-unsafe-declaration-merging': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
    },
    ignorePatterns: [
        'dist/',
        'node_modules/',
        '*.config.*',
        '.eslintrc.cjs',
        'tests/',
        '*.test.ts',
    ],
};
