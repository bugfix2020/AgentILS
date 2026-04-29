/**
 * Mocha entrypoint loaded by VS Code's extension test host.
 * `@vscode/test-electron` requires CommonJS here because the runner uses
 * `require()` to load this file inside the VS Code Node runtime.
 */
'use strict'

const Mocha = require('mocha')
const path = require('path')
const fs = require('fs')

exports.run = function run() {
    const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 })
    const suiteDir = __dirname
    const filter = process.env.AGENTILS_TEST_SUITE // optional: e.g. 'workspace'
    // Load *.test.cjs in this directory; if filter is set, only matching files.
    for (const f of fs.readdirSync(suiteDir)) {
        if (!f.endsWith('.test.cjs')) continue
        if (filter && !f.includes(filter)) continue
        if (!filter && (f.includes('workspace') || f.includes('debug'))) continue // skip workspace+debug suites by default
        mocha.addFile(path.join(suiteDir, f))
    }
    return new Promise((resolve, reject) => {
        try {
            mocha.run((failures) => {
                if (failures > 0) reject(new Error(`${failures} test(s) failed.`))
                else resolve()
            })
        } catch (err) {
            reject(err)
        }
    })
}
