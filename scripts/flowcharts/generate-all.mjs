const modules = [
    { name: 'ch2/state-map', loader: () => import('./ch2/generate-state-map.mjs') },
    { name: 'ch3/control-modes', loader: () => import('./ch3/generate-control-modes.mjs') },
    { name: 'ch4/core', loader: () => import('./ch4/generate-core.mjs') },
    { name: 'ch4/modes', loader: () => import('./ch4/generate-modes.mjs') },
]

for (let i = 0; i < modules.length; i++) {
    const m = modules[i]
    process.stderr.write(`[${i + 1}/${modules.length}] generate ${m.name}\n`)
    await m.loader()
}
