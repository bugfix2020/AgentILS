import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAIN_Y,
  box,
  edge,
  footerNote,
  loadYamlConfig,
  pointAtHalf,
  promptAnnotation,
  render,
  stageRowAuto,
} from './shared.mjs'

const config = loadYamlConfig()
const outputs = []
const CONTENT_LEFT = 50
const CONTENT_WIDTH = 1240
const MODE_BOTTOM_Y = 400
const MODE_FOOTER_X = 1400
const MODE_FOOTER_Y = 240
const MODE_FOOTER_W = 340
const MODE_FOOTER_H = 230

function shiftNodes(nodes, dx) {
  return nodes.map((node) => ({ ...node, x: node.x + dx }))
}

function connectSnake(topNodes, bottomNodes, modeLabel) {
  const edges = []

  edges.push({
    points: [
      [topNodes[0].x + topNodes[0].w, topNodes[0].y + topNodes[0].h / 2],
      [topNodes[1].x, topNodes[1].y + topNodes[1].h / 2],
    ],
    label: { text: '接收需求' },
  })
  edges.push({
    points: [
      [topNodes[1].x + topNodes[1].w, topNodes[1].y + topNodes[1].h / 2],
      [topNodes[2].x, topNodes[2].y + topNodes[2].h / 2],
    ],
    label: { text: 'LLM 判断：\n先继续收敛' },
  })
  edges.push({
    points: [
      [topNodes[2].x + topNodes[2].w, topNodes[2].y + topNodes[2].h / 2],
      [topNodes[3].x, topNodes[3].y + topNodes[3].h / 2],
    ],
    label: { text: '正常法则\n无法继续收敛' },
  })
  edges.push({
    points: [
      [topNodes[3].x + topNodes[3].w / 2, topNodes[3].y + topNodes[3].h],
      [bottomNodes[3].x + bottomNodes[3].w / 2, bottomNodes[3].y],
    ],
  })
  edges.push({
    points: [
      [bottomNodes[3].x, bottomNodes[3].y + bottomNodes[3].h / 2],
      [bottomNodes[2].x + bottomNodes[2].w, bottomNodes[2].y + bottomNodes[2].h / 2],
    ],
    label: { text: '用户明确继续' },
  })
  edges.push({
    points: [
      [bottomNodes[2].x, bottomNodes[2].y + bottomNodes[2].h / 2],
      [bottomNodes[1].x + bottomNodes[1].w, bottomNodes[1].y + bottomNodes[1].h / 2],
    ],
    label: { text: `进入 ${modeLabel}` },
  })
  edges.push({
    points: [
      [bottomNodes[1].x, bottomNodes[1].y + bottomNodes[1].h / 2],
      [bottomNodes[0].x + bottomNodes[0].w, bottomNodes[0].y + bottomNodes[0].h / 2],
    ],
    label: { text: '恢复执行' },
  })

  return edges
}

outputs.push(
  render({
    file: '4.7-alternate-mode.svg',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    content() {
      const topNodes = stageRowAuto(
        ['1', '2', '3', '正常法则\n仍需继续收敛'],
        {
          y: MAIN_Y,
          minW: 170,
          maxW: 260,
          gap: 44,
          left: CONTENT_LEFT,
          right: CANVAS_WIDTH - CONTENT_LEFT - CONTENT_WIDTH,
          contentWidth: 1240,
          containerLeft: CONTENT_LEFT,
          containerWidth: CONTENT_WIDTH,
        },
      )
      const bottomNodes = stageRowAuto(
        ['4', 'alternate', '风险确认\nrisk acknowledgement', '用户明确继续\nexplicit continue'],
        {
          y: MODE_BOTTOM_Y,
          minW: 170,
          maxW: 250,
          gap: 40,
          left: CONTENT_LEFT,
          right: CANVAS_WIDTH - CONTENT_LEFT - CONTENT_WIDTH,
          contentWidth: 1240,
          containerLeft: CONTENT_LEFT + 60,
          containerWidth: CONTENT_WIDTH,
        },
      )
      const delta =
        topNodes[3].x +
        topNodes[3].w / 2 -
        (bottomNodes[3].x + bottomNodes[3].w / 2)
      const alignedBottomNodes = shiftNodes(bottomNodes, delta)
      const edges = connectSnake(topNodes, alignedBottomNodes, 'alternate')
      const topPromptPoint = pointAtHalf(edges[0].points)
      const bottomPromptPoint = pointAtHalf(edges[4].points)

      return `
        ${[...topNodes, ...alignedBottomNodes].map((node) => box(node)).join('\n')}
        ${edges.map((item) => edge(item.points, item.label)).join('\n')}
        ${promptAnnotation(topPromptPoint[0], 330, '用户：我想直接做这个修改', MAIN_Y + 52)}
        ${promptAnnotation(bottomPromptPoint[0], 620, '用户：我已知晓风险，继续', MODE_BOTTOM_Y + alignedBottomNodes[2].h / 2)}
        ${footerNote(config, MODE_FOOTER_X, MODE_FOOTER_Y, MODE_FOOTER_W, MODE_FOOTER_H)}
      `
    },
  }),
)

outputs.push(
  render({
    file: '4.8-direct-mode.svg',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    content() {
      const topNodes = stageRowAuto(
        ['1', '2', '3', '正常法则\n无法继续收敛'],
        {
          y: MAIN_Y,
          minW: 170,
          maxW: 260,
          gap: 44,
          left: CONTENT_LEFT,
          right: CANVAS_WIDTH - CONTENT_LEFT - CONTENT_WIDTH,
          contentWidth: 1260,
          containerLeft: CONTENT_LEFT,
          containerWidth: CONTENT_WIDTH,
        },
      )
      const bottomNodes = stageRowAuto(
        ['4', 'direct', '强风险确认\nstrong acknowledgement', '用户明确继续\nexplicit continue'],
        {
          y: MODE_BOTTOM_Y,
          minW: 170,
          maxW: 260,
          gap: 40,
          left: CONTENT_LEFT,
          right: CANVAS_WIDTH - CONTENT_LEFT - CONTENT_WIDTH,
          contentWidth: 1260,
          containerLeft: CONTENT_LEFT + 60,
          containerWidth: CONTENT_WIDTH,
        },
      )
      const delta =
        topNodes[3].x +
        topNodes[3].w / 2 -
        (bottomNodes[3].x + bottomNodes[3].w / 2)
      const alignedBottomNodes = shiftNodes(bottomNodes, delta)
      const edges = connectSnake(topNodes, alignedBottomNodes, 'direct')
      const topPromptPoint = pointAtHalf(edges[0].points)
      const bottomPromptPoint = pointAtHalf(edges[4].points)

      return `
        ${[...topNodes, ...alignedBottomNodes].map((node) => box(node)).join('\n')}
        ${edges.map((item) => edge(item.points, item.label)).join('\n')}
        ${promptAnnotation(topPromptPoint[0], 330, '用户：我想直接做这个修改', MAIN_Y + 52)}
        ${promptAnnotation(bottomPromptPoint[0], 620, '用户：我已知晓风险，直接做', MODE_BOTTOM_Y + alignedBottomNodes[2].h / 2)}
        ${footerNote(config, MODE_FOOTER_X, MODE_FOOTER_Y, MODE_FOOTER_W, MODE_FOOTER_H)}
      `
    },
  }),
)

console.log(outputs.join('\n'))
