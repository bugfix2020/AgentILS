import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function writeHtml(outFile, title, body) {
  mkdirSync(dirname(outFile), { recursive: true })
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f7f8fb;
      --panel: #ffffff;
      --stroke: #d8ddea;
      --text: #20232d;
      --muted: #667085;
      --blue: #4669EA;
      --red: #E74F4C;
      --green: #0f9d58;
      --amber: #f59e0b;
      --shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      font-family: Inter, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
      background:
        linear-gradient(0deg, rgba(70,105,234,0.03), rgba(70,105,234,0.03)),
        linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px),
        linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
        var(--bg);
      background-size: auto, 32px 32px, 32px 32px, auto;
      color: var(--text);
    }
    .page {
      max-width: 1600px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .hero {
      background: var(--panel);
      border: 1px solid var(--stroke);
      border-radius: 24px;
      padding: 24px 28px;
      box-shadow: var(--shadow);
    }
    .eyebrow {
      color: var(--blue);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 34px;
      line-height: 1.2;
    }
    .subtitle {
      color: var(--muted);
      font-size: 15px;
      line-height: 1.7;
      max-width: 960px;
    }
    .grid {
      display: grid;
      gap: 18px;
    }
    .grid.two {
      grid-template-columns: 1.1fr 0.9fr;
      align-items: start;
    }
    .grid.three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: start;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      padding: 22px;
      box-shadow: var(--shadow);
      height: 100%;
    }
    .panel.fill-grid-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .panel.fill-grid-panel .decision-grid {
      flex: 1 1 auto;
      grid-auto-rows: 1fr;
    }
    .panel h2,
    .panel h3 {
      margin: 0 0 14px;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
    }
    .card {
      border: 1px solid var(--stroke);
      border-radius: 16px;
      padding: 16px 18px;
      background: #fcfcff;
      flex: 1;
    }
    .card .label {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .card .desc {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.7;
      white-space: pre-line;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .tag.blue { background: rgba(70,105,234,0.12); color: var(--blue); }
    .tag.red { background: rgba(231,79,76,0.12); color: var(--red); }
    .tag.amber { background: rgba(245,158,11,0.12); color: var(--amber); }
    .tag.green { background: rgba(15,157,88,0.12); color: var(--green); }
    .list {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.8;
      font-size: 14px;
    }
    .status-layers {
      display: grid;
      gap: 14px;
    }
    .layer {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 16px;
      align-items: start;
      border: 1px solid var(--stroke);
      border-radius: 16px;
      padding: 16px;
      background: #fff;
    }
    .layer-title {
      font-weight: 800;
      font-size: 16px;
    }
    .layer-subtitle {
      color: var(--muted);
      font-size: 13px;
      margin-top: 6px;
      line-height: 1.6;
    }
    .pill-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pill {
      border-radius: 999px;
      border: 1px solid var(--stroke);
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 700;
      background: #fbfcff;
    }
    .pill.active { border-color: var(--blue); color: var(--blue); background: rgba(70,105,234,0.08); }
    .pill.warn { border-color: var(--amber); color: #8a5a00; background: rgba(245,158,11,0.08); }
    .pill.risk { border-color: var(--red); color: var(--red); background: rgba(231,79,76,0.08); }
    .pill.ok { border-color: var(--green); color: var(--green); background: rgba(15,157,88,0.08); }
    .flow {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .flow-step {
      min-width: 150px;
      text-align: center;
      border: 1px solid var(--stroke);
      border-radius: 14px;
      padding: 14px 16px;
      background: #fff;
      font-weight: 700;
      line-height: 1.5;
    }
    .flow-arrow {
      color: var(--blue);
      font-size: 22px;
      font-weight: 800;
    }
    .compare {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
    .mode {
      border-radius: 18px;
      padding: 20px;
      border: 1px solid var(--stroke);
      background: white;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .mode h3 {
      margin: 0 0 8px;
      font-size: 22px;
    }
    .mode .mode-name {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 14px;
    }
    .mode .mode-summary {
      font-size: 15px;
      line-height: 1.8;
      color: var(--text);
      margin-bottom: 14px;
      min-height: 81px;
    }
    .mode.normal { border-top: 4px solid var(--green); }
    .mode.alternate { border-top: 4px solid var(--amber); }
    .mode.direct { border-top: 4px solid var(--red); }
    .note {
      font-size: 13px;
      color: var(--muted);
      line-height: 1.7;
    }
    .rail {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .rail-row {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 14px;
      align-items: start;
      border: 1px solid var(--stroke);
      border-radius: 16px;
      padding: 14px 16px;
      background: #fff;
    }
    .rail-head {
      font-weight: 800;
      font-size: 15px;
      line-height: 1.5;
    }
    .rail-body {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-line;
    }
    .decision-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      align-items: start;
    }
    .decision-grid.two-cols {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .decision-card {
      border: 1px solid var(--stroke);
      border-radius: 16px;
      padding: 16px;
      background: #fff;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .decision-card h4 {
      margin: 0 0 10px;
      font-size: 16px;
    }
    .decision-card p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-line;
    }
    .mini-flow {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mini-line {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .mini-line.fill {
      flex-wrap: nowrap;
      justify-content: stretch;
    }
    .mini-line.fill .mini-node {
      flex: 1 1 0;
      min-width: 0;
    }
    .mini-line.tight {
      flex-wrap: nowrap;
      justify-content: stretch;
      gap: 8px;
    }
    .mini-line.tight .mini-node {
      flex: 1 1 0;
      min-width: 0;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.35;
    }
    .mini-line.tight .mini-arrow {
      font-size: 16px;
      flex: 0 0 auto;
    }
    .mini-node {
      border: 1px solid var(--stroke);
      border-radius: 12px;
      padding: 10px 12px;
      background: #fff;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.5;
      min-width: 130px;
      text-align: center;
    }
    .mini-node.blue {
      border-color: var(--blue);
      color: var(--blue);
      background: rgba(70,105,234,0.07);
    }
    .mini-node.amber {
      border-color: var(--amber);
      color: #8a5a00;
      background: rgba(245,158,11,0.08);
    }
    .mini-node.red {
      border-color: var(--red);
      color: var(--red);
      background: rgba(231,79,76,0.08);
    }
    .mini-arrow {
      color: var(--blue);
      font-size: 18px;
      font-weight: 800;
    }
    @media (max-width: 1100px) {
      body { padding: 18px; }
      .grid.two, .grid.three, .compare, .decision-grid { grid-template-columns: 1fr; }
      .layer, .rail-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="page">
    ${body}
  </main>
</body>
</html>`
  writeFileSync(outFile, html, 'utf8')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
