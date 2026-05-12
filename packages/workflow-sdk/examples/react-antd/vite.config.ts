import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const sdkRoot = path.resolve(__dirname, '../..')

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@agent-ils/workflow-sdk/react': path.join(sdkRoot, 'dist/react.js'),
            '@agent-ils/workflow-sdk/vue': path.join(sdkRoot, 'dist/vue.js'),
            '@agent-ils/workflow-sdk/core': path.join(sdkRoot, 'dist/core.js'),
            '@agent-ils/workflow-sdk': path.join(sdkRoot, 'dist/index.js'),
        },
    },
})
