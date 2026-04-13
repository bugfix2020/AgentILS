import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const OUT_DIR = resolve('docs/agentils/flowcharts/ch4')
export const CONFIG_FILE = resolve('scripts/flowcharts/ch4/config.yaml')

export const CANVAS_WIDTH = 1800
export const CANVAS_HEIGHT = 700
export const BOX_W = 260
export const BOX_H = 110
export const BOX_GAP = 180
export const MAIN_Y = 170
export const FOOTER_X = 1380
export const FOOTER_Y = 340
export const FOOTER_W = 360
export const FOOTER_H = 220

export const COLORS = {
  bg: '#fbfbfb',
  grid: '#e7e7e7',
  stroke: '#333333',
  text: '#222222',
  hint: '#666666',
  boxFill: '#ffffff',
  rollback: '#E74F4C',
  prompt: '#4669EA',
}

export const STAGE_TEXT = {
  '1': '1\ncollect\n需求收集',
  '2': '2\nconfirm_elements\n关键要素确认',
  '3': '3\nplan\n计划生成',
  '4': '4\nexecute\n执行改动',
  '5': '5\nverify\n结果验证',
  risk: '风险提示\nrisk acknowledgement\n用户知晓风险',
  riskStrong: '强风险提示\nstrong risk acknowledgement\n用户确认接管',
  alternate: 'alternate\n备用法则',
  direct: 'direct\n直接法则',
}

export function loadYamlConfig(file = CONFIG_FILE) {
  const text = readFileSync(file, 'utf8')
  const result = {}
  let currentKey = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (keyMatch && !line.startsWith('  - ')) {
      const [, key, value] = keyMatch
      if (value === '') {
        result[key] = []
        currentKey = key
      } else {
        result[key] = value.trim()
        currentKey = null
      }
      continue
    }

    const itemMatch = line.match(/^\s*-\s*(.*)$/)
    if (itemMatch && currentKey) {
      result[currentKey].push(itemMatch[1])
    }
  }

  return result
}

export function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function textBlock(x, y, text, opts = {}) {
  const rows = String(text).split('\n')
  const size = opts.size ?? 18
  const weight = opts.weight ?? 500
  const fill = opts.fill ?? COLORS.text
  const lineHeight = opts.lineHeight ?? Math.round(size * 1.35)
  const startY = y - ((rows.length - 1) * lineHeight) / 2
  const tspans = rows
    .map((row, index) => {
      const dy = index === 0 ? 0 : lineHeight
      return `<tspan x="${x}" dy="${dy}">${esc(row)}</tspan>`
    })
    .join('')
  return `<text x="${x}" y="${startY}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${fill}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${tspans}</text>`
}

export function leftTextBlock(x, y, text, opts = {}) {
  const rows = String(text).split('\n')
  const size = opts.size ?? 16
  const weight = opts.weight ?? 500
  const fill = opts.fill ?? COLORS.text
  const lineHeight = opts.lineHeight ?? Math.round(size * 1.45)
  return `
    <text x="${x}" y="${y}" text-anchor="start" font-size="${size}" font-weight="${weight}" fill="${fill}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">
      ${rows
        .map((row, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(row)}</tspan>`)
        .join('')}
    </text>
  `
}

export function grid(width, height, step = 32) {
  const vertical = []
  const horizontal = []
  for (let x = 0; x <= width; x += step) vertical.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${COLORS.grid}" stroke-width="1" />`)
  for (let y = 0; y <= height; y += step) horizontal.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1" />`)
  return `${vertical.join('\n')}\n${horizontal.join('\n')}`
}

export function box(node) {
  return `
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" ry="8"
      fill="${COLORS.boxFill}" stroke="${COLORS.stroke}" stroke-width="2.5" />
    ${textBlock(node.x + node.w / 2, node.y + node.h / 2, node.text, { size: node.fontSize ?? 20 })}
  `
}

export function path(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ')
}

function segmentLength(a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.hypot(dx, dy)
}

export function pointAtHalf(points) {
  if (points.length === 1) return points[0]
  const segments = []
  let total = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const len = segmentLength(points[index], points[index + 1])
    segments.push({ start: points[index], end: points[index + 1], len })
    total += len
  }
  let target = total / 2
  for (const segment of segments) {
    if (target <= segment.len) {
      const ratio = segment.len === 0 ? 0 : target / segment.len
      return [
        segment.start[0] + (segment.end[0] - segment.start[0]) * ratio,
        segment.start[1] + (segment.end[1] - segment.start[1]) * ratio,
      ]
    }
    target -= segment.len
  }
  return points[points.length - 1]
}

export function edge(points, label) {
  const stroke = label?.kind === 'rollback' ? COLORS.rollback : COLORS.stroke
  const textFill =
    label?.kind === 'rollback'
      ? COLORS.rollback
      : label?.kind === 'prompt'
        ? COLORS.prompt
        : COLORS.text
  let labelSvg = ''
  if (label?.text) {
    const point = pointAtHalf(points)
    labelSvg = textBlock(point[0], point[1] - 18, label.text, { size: 16, fill: textFill, weight: 500 })
  }
  const marker = label?.noArrow ? '' : ` marker-end="url(#arrow-${stroke.slice(1)})"`
  return `
    <path d="${path(points)}" fill="none" stroke="${stroke}" stroke-width="2.5"${marker} />
    ${labelSvg}
  `
}

export function promptAnnotation(x, y, text, lineTopY) {
  return `
    <circle cx="${x}" cy="${y}" r="7" fill="${COLORS.prompt}" />
    <path d="M ${x} ${y - 7} L ${x} ${lineTopY}" fill="none" stroke="${COLORS.prompt}" stroke-width="2.5" stroke-dasharray="4 6" />
    ${leftTextBlock(x + 16, y + 8, text, { size: 16, fill: COLORS.prompt, weight: 600, lineHeight: 24 })}
  `
}

export function footerNote(config, x = FOOTER_X, y = FOOTER_Y, w = FOOTER_W, h = FOOTER_H) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8"
      fill="#fffdf7" stroke="${COLORS.stroke}" stroke-width="1.5" />
    ${leftTextBlock(x + 16, y + 24, config.footer_title, {
      size: 15,
      fill: COLORS.rollback,
      weight: 700,
      lineHeight: 21,
    })}
    ${leftTextBlock(x + 16, y + 50, config.footer_risk_lines.join('\n'), {
      size: 14,
      fill: COLORS.rollback,
      weight: 600,
      lineHeight: 21,
    })}
    ${leftTextBlock(x + 16, y + 122, [config.footer_model_title, ...config.footer_model_lines].join('\n'), {
      size: 14,
      fill: COLORS.hint,
      weight: 500,
      lineHeight: 21,
    })}
    ${leftTextBlock(x + 16, y + 206, config.footer_disclaimer, {
      size: 13,
      fill: COLORS.hint,
      weight: 500,
      lineHeight: 20,
    })}
  `
}

export function stageRow(labels, opts = {}) {
  const y = opts.y ?? MAIN_Y
  const w = opts.w ?? BOX_W
  const h = opts.h ?? BOX_H
  const gap = opts.gap ?? BOX_GAP
  const totalWidth = labels.length * w + (labels.length - 1) * gap
  const startX = opts.startX ?? Math.round((CANVAS_WIDTH - totalWidth) / 2)
  return labels.map((label, index) => ({
    x: startX + index * (w + gap),
    y,
    w,
    h,
    text: STAGE_TEXT[label] ?? label,
  }))
}

export function estimateNodeWidth(text, fontSize = 20) {
  const longest = String(text)
    .split('\n')
    .reduce((max, line) => Math.max(max, line.length), 0)
  return Math.ceil(longest * fontSize * 0.62 + 56)
}

export function stageRowAuto(labels, opts = {}) {
  const y = opts.y ?? MAIN_Y
  const h = opts.h ?? BOX_H
  const fontSize = opts.fontSize ?? 20
  const minW = opts.minW ?? 150
  const maxW = opts.maxW ?? 250
  let gap = opts.gap ?? 56
  const left = opts.left ?? 80
  const right = opts.right ?? 80
  const availableWidth = opts.availableWidth ?? CANVAS_WIDTH - left - right
  const preferredContentWidth = opts.contentWidth ?? null
  const containerLeft = opts.containerLeft ?? 0
  const containerWidth = opts.containerWidth ?? null

  let widths = labels.map((label) => {
    const text = STAGE_TEXT[label] ?? label
    return Math.max(minW, Math.min(maxW, estimateNodeWidth(text, fontSize)))
  })

  const totalWidth = () => widths.reduce((sum, width) => sum + width, 0) + (labels.length - 1) * gap
  if (totalWidth() > availableWidth) {
    gap = Math.max(32, Math.floor((availableWidth - widths.reduce((sum, width) => sum + width, 0)) / Math.max(1, labels.length - 1)))
  }
  if (totalWidth() > availableWidth) {
    const widthBudget = availableWidth - (labels.length - 1) * gap
    const currentWidthTotal = widths.reduce((sum, width) => sum + width, 0)
    const ratio = widthBudget / currentWidthTotal
    widths = widths.map((width) => Math.max(minW, Math.floor(width * ratio)))
  }

  let rowWidth = widths.reduce((sum, width) => sum + width, 0) + (labels.length - 1) * gap

  if (preferredContentWidth && !opts.startX && preferredContentWidth > rowWidth && labels.length > 1) {
    gap += Math.floor((preferredContentWidth - rowWidth) / (labels.length - 1))
    rowWidth = widths.reduce((sum, width) => sum + width, 0) + (labels.length - 1) * gap
  }

  let x
  if (opts.startX !== undefined) {
    x = opts.startX
  } else if (containerWidth !== null) {
    x = containerLeft + Math.round((containerWidth - rowWidth) / 2)
  } else {
    x = Math.round((CANVAS_WIDTH - rowWidth) / 2)
  }

  return labels.map((label, index) => {
    const node = {
      x,
      y,
      w: widths[index],
      h,
      text: STAGE_TEXT[label] ?? label,
    }
    x += widths[index] + gap
    return node
  })
}

export function connectLinear(nodes) {
  const result = []
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const left = nodes[index]
    const right = nodes[index + 1]
    result.push({
      points: [
        [left.x + left.w, left.y + left.h / 2],
        [right.x, right.y + right.h / 2],
      ],
    })
  }
  return result
}

export function render(spec) {
  const width = spec.width ?? CANVAS_WIDTH
  const height = spec.height ?? CANVAS_HEIGHT
  const outFile = resolve(OUT_DIR, spec.file)
  mkdirSync(dirname(outFile), { recursive: true })

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow-333333" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${COLORS.stroke}" />
    </marker>
    <marker id="arrow-E74F4C" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${COLORS.rollback}" />
    </marker>
    <marker id="arrow-4669EA" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${COLORS.prompt}" />
    </marker>
  </defs>
  <rect width="${width}" height="${height}" fill="${COLORS.bg}" />
  ${grid(width, height)}
  ${spec.content()}
</svg>
`.trim()

  writeFileSync(outFile, `${svg}\n`, 'utf8')
  return outFile
}
