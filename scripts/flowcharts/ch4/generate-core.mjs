import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAIN_Y,
  connectLinear,
  edge,
  footerNote,
  loadYamlConfig,
  pointAtHalf,
  promptAnnotation,
  render,
  stageRow,
  box,
  BOX_H,
} from './shared.mjs'

const config = loadYamlConfig()
const outputs = []

outputs.push(
  render({
    file: '4.1-simple-pass.svg',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    content() {
      const nodes = stageRow(['1', '2', '3', '4'])
      const edges = connectLinear(nodes)
      const promptPoint = pointAtHalf(edges[0].points)
      edges[0].label = { text: '接收需求' }
      edges[1].label = { text: 'LLM 判断：\n目标明确' }
      edges[2].label = { text: '直接进入\n正常法则' }
      return `
        ${nodes.map(box).join('\n')}
        ${edges.map((item) => edge(item.points, item.label)).join('\n')}
        ${promptAnnotation(promptPoint[0], 390, '用户：把这处文案改掉', MAIN_Y + 52)}
        ${footerNote(config)}
      `
    },
  }),
)

outputs.push(
  render({
    file: '4.2-loop-plan-converge.svg',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    content() {
      const nodes = stageRow(['1', '2', '3', '4'])
      const edges = connectLinear(nodes)
      const promptPoint = pointAtHalf(edges[0].points)
      edges[0].label = { text: '接收需求' }
      edges[1].label = { text: 'LLM 判断：\n先进入确认与规划' }
      edges[2].label = { text: '方案准备执行' }
      edges.push({
        points: [
          [nodes[2].x + nodes[2].w / 2, nodes[2].y + nodes[2].h],
          [nodes[2].x + nodes[2].w / 2, 360],
          [nodes[1].x + nodes[1].w / 2, 360],
          [nodes[1].x + nodes[1].w / 2, nodes[1].y + nodes[1].h],
        ],
        label: { text: '方案被用户否决 /\n信息仍不稳定', kind: 'rollback' },
      })
      return `
        ${nodes.map(box).join('\n')}
        ${edges.map((item) => edge(item.points, item.label)).join('\n')}
        ${promptAnnotation(promptPoint[0], 390, '用户：先按这个方案做', MAIN_Y + 52)}
        ${footerNote(config)}
      `
    },
  }),
)

outputs.push(
  render({
    file: '4.3-loop-execute-rollback.svg',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    content() {
      const nodes = stageRow(['1', '2', '3', '4'])
      const edges = connectLinear(nodes)
      const promptPoint = pointAtHalf(edges[0].points)
      edges[0].label = { text: '接收需求' }
      edges[1].label = { text: 'LLM 判断：\n当前信息足够进入规划' }
      edges[2].label = { text: '开始执行' }
      edges.push({
        points: [
          [nodes[3].x + nodes[3].w / 2, nodes[3].y],
          [nodes[3].x + nodes[3].w / 2, 90],
          [nodes[1].x + nodes[1].w / 2, 90],
          [nodes[1].x + nodes[1].w / 2, nodes[1].y],
        ],
        label: { text: '执行中发现新的影响面 / 新问题', kind: 'rollback' },
      })
      edges.push({
        points: [
          [nodes[2].x + nodes[2].w / 2, nodes[2].y + nodes[2].h],
          [nodes[2].x + nodes[2].w / 2, 360],
          [nodes[1].x + nodes[1].w / 2, 360],
          [nodes[1].x + nodes[1].w / 2, nodes[1].y + nodes[1].h],
        ],
        label: { text: '原方案不成立 / 需要重新确认', kind: 'rollback' },
      })
      return `
        ${nodes.map(box).join('\n')}
        ${edges.map((item) => edge(item.points, item.label)).join('\n')}
        ${promptAnnotation(promptPoint[0], 390, '用户：帮我直接把这个点改掉', MAIN_Y + 52)}
        ${footerNote(config)}
      `
    },
  }),
)

outputs.push(
  render({
    file: '4.4-loop-verify-rollback.svg',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    content() {
      const nodes = stageRow(['1', '2', '3', '4', '5'], { gap: 120, w: 230, h: BOX_H })
      const edges = connectLinear(nodes)
      const promptPoint = pointAtHalf(edges[0].points)
      edges[0].label = { text: '接收需求' }
      edges[1].label = { text: 'LLM 判断：\n先完成规划' }
      edges[2].label = { text: '进入执行' }
      edges[3].label = { text: '进入验证' }
      edges.push({
        points: [
          [nodes[2].x + nodes[2].w / 2, nodes[2].y + nodes[2].h],
          [nodes[2].x + nodes[2].w / 2, 360],
          [nodes[1].x + nodes[1].w / 2, 360],
          [nodes[1].x + nodes[1].w / 2, nodes[1].y + nodes[1].h],
        ],
        label: { text: '方案被用户否决 /\n信息仍不稳定', kind: 'rollback' },
      })
      edges.push({
        points: [
          [nodes[4].x + nodes[4].w / 2, nodes[4].y],
          [nodes[4].x + nodes[4].w / 2, 90],
          [nodes[2].x + nodes[2].w / 2, 90],
          [nodes[2].x + nodes[2].w / 2, nodes[2].y],
        ],
        label: { text: '验证失败\n需要重新规划', kind: 'rollback' },
      })
      return `
        ${nodes.map(box).join('\n')}
        ${edges.map((item) => edge(item.points, item.label)).join('\n')}
        ${promptAnnotation(promptPoint[0], 390, '用户：改完后帮我确认结果', MAIN_Y + 52)}
        ${footerNote(config)}
      `
    },
  }),
)

console.log(outputs.join('\n'))
