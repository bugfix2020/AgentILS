import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: [
            '**/dist/**',
            '**/build/**',
            '**/node_modules/**',
            '**/*.min.js',
            'packages/extensions/*/webview/**',
            'scripts/**/*.mjs',
        ],
    },
    {
        files: ['**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                __dirname: 'readonly',
                console: 'readonly',
                module: 'readonly',
                process: 'readonly',
                require: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-require-imports': 'warn',
            'no-console': 'warn',
        },
    },
    {
        files: ['**/*.cjs'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    {
        files: ['apps/e2e-userflow/test/**/*.{ts,mjs,cjs}', 'packages/mcp/test/**/*.ts'],
        languageOptions: {
            globals: {
                AbortSignal: 'readonly',
                Buffer: 'readonly',
                clearInterval: 'readonly',
                console: 'readonly',
                fetch: 'readonly',
                process: 'readonly',
                setInterval: 'readonly',
                setTimeout: 'readonly',
                suite: 'readonly',
                suiteSetup: 'readonly',
                test: 'readonly',
                TextDecoder: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
)
