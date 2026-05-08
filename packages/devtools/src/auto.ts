/**
 * Side-effect entry: import this once and the SDK boots with default options.
 *
 *     import '@agent-ils/devtools/auto'
 *
 * For finer control, import { init } from '@agent-ils/devtools' instead.
 */
import { init } from './index.js'

init({ instrumentFetch: true, consoleMirror: false, panel: true })
