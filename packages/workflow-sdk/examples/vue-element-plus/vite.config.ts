import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const sdkRoot = path.resolve(__dirname, '../..')

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@agent-ils/workflow-sdk/react': path.join(sdkRoot, 'dist/react.js'),
            '@agent-ils/workflow-sdk/vue': path.join(sdkRoot, 'dist/vue.js'),
            '@agent-ils/workflow-sdk': path.join(sdkRoot, 'dist/index.js'),
        },
    },
})
