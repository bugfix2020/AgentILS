/** @type {import('lint-staged').Configuration} */
const config = {
    '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix --max-warnings=0 --no-warn-ignored', 'prettier --write'],
    '*.{json,md,yaml,yml}': ['prettier --write'],
}

export default config
