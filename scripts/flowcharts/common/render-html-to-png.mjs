import { dirname, resolve } from 'node:path'
import { accessSync, constants, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const CANDIDATE_EXECUTABLES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
]

export async function renderHtmlToPng(htmlFile, pngFile, options = {}) {
  const browser = await puppeteer.launch({
    executablePath: resolveExecutablePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({
      width: options.width ?? 1600,
      height: options.height ?? 1200,
      deviceScaleFactor: options.deviceScaleFactor ?? 2
    })
    await page.goto(pathToFileURL(resolve(htmlFile)).href, {
      waitUntil: 'networkidle0'
    })
    await page.screenshot({
      path: resolveOutput(pngFile),
      fullPage: true,
      type: 'png'
    })
  } finally {
    await browser.close()
  }
}

function resolveExecutablePath() {
  const envPath = process.env.CHROME_EXECUTABLE_PATH
  if (envPath) {
    return envPath
  }
  const found = CANDIDATE_EXECUTABLES.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK)
      return true
    } catch {
      return false
    }
  })
  if (found) {
    return found
  }
  throw new Error(
    'No Chrome executable found. Set CHROME_EXECUTABLE_PATH to a local Chrome/Chromium binary.'
  )
}

function resolveOutput(file) {
  const out = resolve(file)
  mkdirSync(dirname(out), { recursive: true })
  return out
}
