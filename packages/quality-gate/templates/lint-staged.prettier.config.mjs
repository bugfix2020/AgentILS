/** @type {import('lint-staged').Configuration} */
const config = {
    '*.{ts,tsx,js,mjs,cjs}': ['prettier --write'],
    '*.{json,md,yaml,yml}': ['prettier --write'],
}

export default config
