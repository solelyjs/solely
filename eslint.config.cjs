// ESLint 9 Flat Config
// 由原 .eslintrc.cjs 迁移而来（2026-10-16），规则保持一致
const js = require('@eslint/js');
const tseslintParser = require('@typescript-eslint/parser');
const tseslintPlugin = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');

module.exports = [
    // 全局忽略（原 ignorePatterns）
    {
        ignores: [
            'dist/',
            'dist-examples/',
            'dist-verify/',
            'node_modules/',
            '*.config.*',
            'tests/',
            '*.test.ts',
            'coverage/',
            'coverage-tmp/',
            'vscode-extension/',
            'dev-tool/',
        ],
    },

    // typescript-eslint recommended：自带 eslintRecommended overrides
    // （关闭 no-unused-vars/no-redeclare 等对 TS 无效的基础规则，改用 TS 版本）
    ...tseslintPlugin.configs['flat/recommended'],

    // 主配置：src、examples、docs 下的 TS（自定义规则覆盖 recommended 默认值）
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: tseslintParser,
            globals: {
                ...globals.browser,
                ...globals.es2021,
                ...globals.node,
                // vite build.define 注入的全局常量
                __SOLELY_VERSION__: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslintPlugin,
        },
        rules: {
            ...js.configs.recommended.rules,

            // 关闭对 TS 无效的基础规则（由 @typescript-eslint 版本接管）
            // 注意：不可省略，否则上面的 js.configs.recommended.rules 会将其重新打开
            'no-unused-vars': 'off',
            'no-undef': 'off',
            'no-redeclare': 'off',

            // 基础规则
            indent: ['error', 4, { SwitchCase: 1 }],
            'linebreak-style': 'off',
            quotes: 'off',
            semi: ['error', 'always'],
            'max-len': ['warn', { code: 120 }],

            // TypeScript 规则
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/prefer-optional-chain': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',

            // 最佳实践
            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
            'no-debugger': 'error',
            'no-case-declarations': 'off',
            'no-prototype-builtins': 'off',
            'no-useless-escape': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            '@typescript-eslint/no-unsafe-declaration-merging': 'off',
            // no-unused-expressions：新版 recommended 新增默认开启，与原 .eslintrc 行为不一致，
            // 且本项目模板绑定场景存在大量此类写法，迁移期先关闭
            '@typescript-eslint/no-unused-expressions': 'off',
        },
    },

    // 为示例文件放宽规则（原 overrides）
    {
        files: ['examples/**/*.ts'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
            'max-len': 'off',
        },
    },
];
