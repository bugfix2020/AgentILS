#!/usr/bin/env node
// One-shot: render docs/assets/ils-approach.html in headless Chromium and
// capture three GIFs (one per panel) of a full animation cycle.
//
//   node scripts/dev/record-ils-gifs.mjs
//
// Outputs:
//   docs/assets/ils-on-slope.gif   (Case A · standard approach)
//   docs/assets/ils-too-high.gif   (Case B · above glide slope)
//   docs/assets/ils-too-low.gif    (Case C · below glide slope)
//
// Requires: playwright (workspace devDep) + ffmpeg on PATH.

import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')
const DEMO = resolve(ROOT, 'docs/assets/ils-approach.html')
const OUT_DIR = resolve(ROOT, 'docs/assets')

const CASES = [
    { key: 'good', file: 'ils-on-slope' },
    { key: 'warn', file: 'ils-too-high' },
    { key: 'bad', file: 'ils-too-low' },
]

const LANGS = [
    { code: 'en', suffix: '' },
    { code: 'zh', suffix: '.zh' },
]

const FPS = 25
const DURATION_MS = 5700 // ~ 4500ms cycle + 1200ms hold
const FRAMES = Math.round((FPS * DURATION_MS) / 1000)

function which(bin) {
    const r = spawnSync('which', [bin])
    return r.status === 0 ? r.stdout.toString().trim() : null
}

async function captureCase(page, caseKey, outGif) {
    // Locate the panel SVG and compute its bounding box (CSS pixels).
    const handle = await page.$(`svg[data-case="${caseKey}"]`)
    if (!handle) throw new Error(`SVG not found for case ${caseKey}`)
    // Wait one frame so layout is stable.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))

    const tmp = await mkdtemp(join(tmpdir(), `ils-${caseKey}-`))
    console.log(`[${caseKey}] capturing ${FRAMES} frames @ ${FPS}fps -> ${tmp}`)

    const startTs = Date.now()
    for (let i = 0; i < FRAMES; i++) {
        const target = startTs + (i * 1000) / FPS
        const wait = target - Date.now()
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        const num = String(i).padStart(4, '0')
        await handle.screenshot({ path: join(tmp, `f-${num}.png`), omitBackground: false })
    }

    console.log(`[${caseKey}] encoding GIF -> ${outGif}`)
    // Two-pass palette workflow for cleaner GIFs.
    const palette = join(tmp, 'palette.png')
    const ffmpeg = (args) => spawnSync('ffmpeg', args, { stdio: 'inherit' })
    let r = ffmpeg([
        '-y',
        '-framerate',
        String(FPS),
        '-i',
        join(tmp, 'f-%04d.png'),
        '-vf',
        `fps=${FPS},scale=720:-1:flags=lanczos,palettegen=stats_mode=diff`,
        palette,
    ])
    if (r.status !== 0) throw new Error('palettegen failed')
    r = ffmpeg([
        '-y',
        '-framerate',
        String(FPS),
        '-i',
        join(tmp, 'f-%04d.png'),
        '-i',
        palette,
        '-lavfi',
        `fps=${FPS},scale=720:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
        '-loop',
        '0',
        outGif,
    ])
    if (r.status !== 0) throw new Error('GIF encode failed')

    await rm(tmp, { recursive: true, force: true })
}

async function main() {
    if (!which('ffmpeg')) {
        console.error('ffmpeg not found on PATH. Install via `brew install ffmpeg`.')
        process.exit(1)
    }
    await mkdir(OUT_DIR, { recursive: true })

    const browser = await chromium.launch()
    const context = await browser.newContext({
        viewport: { width: 1280, height: 1600 },
        deviceScaleFactor: 2, // retina-quality frames
    })
    const page = await context.newPage()
    await page.goto(pathToFileURL(DEMO).href)
    // Wait for SVGs and one animation tick.
    await page.waitForSelector('svg[data-case="good"]')
    await page.waitForSelector('svg[data-case="warn"]')
    await page.waitForSelector('svg[data-case="bad"]')
    await page.waitForTimeout(300)

    for (const lang of LANGS) {
        await page.evaluate((l) => window.applyLang && window.applyLang(l), lang.code)
        await page.waitForTimeout(150)
        for (const c of CASES) {
            const out = join(OUT_DIR, `${c.file}${lang.suffix}.gif`)
            await captureCase(page, c.key, out)
        }
    }

    await browser.close()
    console.log('\nDone. Files:')
    for (const lang of LANGS) for (const c of CASES) console.log(`  docs/assets/${c.file}${lang.suffix}.gif`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
