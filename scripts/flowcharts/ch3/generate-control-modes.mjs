import { resolve } from 'node:path'
import { writeHtml } from '../common/html-shared.mjs'
import { renderHtmlToPng } from '../common/render-html-to-png.mjs'

const outFile = resolve('docs/agentils/flowcharts/ch3/control-modes.html')
const outImage = resolve('docs/agentils/flowcharts/ch3/control-modes.png')

const body = `
<section class="hero">
  <div class="eyebrow">Chapter 3</div>
  <h1>第三章 控制法则</h1>
  <div class="subtitle">
    本章定义 AgentILS 的三种控制法则：
    normal、alternate、direct。
    核心关注点是进入条件、触发位置、系统责任边界，以及法则切换条件。
  </div>
</section>

<section class="panel">
  <h2>3.1 三种法则的共同前提</h2>
  <div class="rail">
    <div class="rail-row">
      <div class="rail-head">控制法则不是任务阶段</div>
      <div class="rail-body">collect / plan / execute / verify 表示当前任务做到哪一步。
normal / alternate / direct 表示当前系统以什么控制强度在工作。</div>
    </div>
    <div class="rail-row">
      <div class="rail-head">控制法则只控制系统运行等级</div>
      <div class="rail-body">如果正常 loop 还能继续收敛，就留在 normal。
如果收敛不完整，但用户要求继续，就进入 alternate。
如果用户明确知晓风险并直接接管，就进入 direct。</div>
    </div>
    <div class="rail-row">
      <div class="rail-head">法则切换发生在哪里</div>
      <div class="rail-body">主要发生在 confirm_elements / plan / execute 的边界上。
也就是系统发现：
  - 信息还不完整
  - 方案还不稳定
  - 风险已经暴露
但用户仍要求继续时，才会从 normal 切到 alternate 或 direct。</div>
    </div>
  </div>
</section>

<section class="compare">
  <article class="mode normal">
    <div class="tag green">3.2 Normal / 正常法则</div>
    <h3>进入条件</h3>
    <div class="mode-summary">正常 loop 仍然能通过 collect → confirm_elements → plan → execute → verify 收敛。</div>
    <div class="stack">
      <div class="card">
        <div class="label">在哪里发挥作用</div>
        <div class="desc">collect / confirm_elements / plan / execute / verify 全链路。
PreToolUse、Stop gate、verify gate 都按正常规则工作。</div>
      </div>
      <div class="card">
        <div class="label">控制什么</div>
        <div class="desc">完整追问、完整规划、完整执行、完整验证。
如果信息不足，就继续回到 collect / confirm_elements / plan。</div>
      </div>
      <div class="card">
        <div class="label">用户对话示例</div>
        <div class="desc">用户说：帮我把登录按钮文案改成 Log in。
系统判断：目标明确、边界清楚、风险低，所以继续走 normal。</div>
      </div>
    </div>
  </article>

  <article class="mode alternate">
    <div class="tag amber">3.3 Alternate / 备用法则</div>
    <h3>进入条件</h3>
    <div class="mode-summary">正常法则还没有完全收敛，但用户明确表示“先这样继续做”。</div>
    <div class="stack">
      <div class="card">
        <div class="label">在哪里发挥作用</div>
        <div class="desc">主要作用在 plan -> execute 之前，以及 execute 过程中的问题回退。
UI 上要显示当前已进入备用法则；summary 里也要记录。</div>
      </div>
      <div class="card">
        <div class="label">控制什么</div>
        <div class="desc">仍允许执行，但必须显式暴露：
当前假设、未验证项、建议人工检查点。
同时限制系统大步扩张范围。</div>
      </div>
      <div class="card">
        <div class="label">用户对话示例</div>
        <div class="desc">用户说：先这样吧，继续做。
系统判断：继续做可以，但不能再假装已经完全收敛，所以进入 alternate。</div>
      </div>
    </div>
  </article>

  <article class="mode direct">
    <div class="tag red">3.4 Direct / 直接法则</div>
    <h3>进入条件</h3>
    <div class="mode-summary">用户明确表示“我已知晓风险，直接执行”。系统不再强控完整流程。</div>
    <div class="stack">
      <div class="card">
        <div class="label">在哪里发挥作用</div>
        <div class="desc">主要作用在正常 loop 已经收不动、且用户明确接管之后。
UI、summary、audit 都要显示当前 task 已进入 direct。</div>
      </div>
      <div class="card">
        <div class="label">控制什么</div>
        <div class="desc">系统只保留最小提示、最小审计、最小 summary 标记。
LLM 自主决定继续问还是直接做。</div>
      </div>
      <div class="card">
        <div class="label">用户对话示例</div>
        <div class="desc">用户说：我已知晓风险，直接执行。
系统判断：进入 direct，由用户接管决策责任。</div>
      </div>
    </div>
  </article>
</section>

<section class="panel">
  <h2>3.5 控制法则切换逻辑</h2>
  <div class="mini-flow">
    <div class="mini-line fill">
      <div class="mini-node blue">Normal<br/>正常 loop 还能继续收敛</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node amber">Alternate<br/>用户要求继续，但系统仍保留基础控制</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node red">Direct<br/>用户明确接管，系统只保留最小辅助</div>
    </div>
  </div>
  <p class="note" style="margin-top:14px;">
    Direct 不是失败，也不是系统“坏了”。它表示用户主动接管，AgentILS 从强控制层退化成最薄的一层辅助与审计层。
  </p>
</section>

<section class="grid two">
  <article class="panel fill-grid-panel">
    <h2>3.6 使用和实现时的判断原则</h2>
    <div class="decision-grid two-cols">
      <div class="decision-card">
        <h4>Normal</h4>
        <p>能继续问、能继续收敛、能继续验证。
这时不要提前切 alternate/direct。</p>
      </div>
      <div class="decision-card">
        <h4>Alternate</h4>
        <p>可以继续做，但必须显式暴露假设和风险。
适用于“继续，但别假装已经完全清楚”。</p>
      </div>
      <div class="decision-card">
        <h4>Direct</h4>
        <p>用户承担决策责任，系统只保留最小控制。
适用于“我已知晓风险，直接做”。</p>
      </div>
      <div class="decision-card">
        <h4>最重要边界</h4>
        <p>不是“风险提示后就一定进 alternate/direct”，而是“正常法则收不动了且用户要求继续”才切换。</p>
      </div>
    </div>
  </article>
  <article class="panel">
    <h2>3.7 一个完整判断例子</h2>
    <div class="card">
      <div class="label">用户说：帮我直接把这个点改掉</div>
      <div class="desc">系统第一步不会直接进入 direct。
它会先尝试按 normal 去 collect / confirm / plan。

如果 normal 还能继续收敛：
  继续 normal

如果 normal 收敛不动了，而用户仍要求继续：
  进入 alternate

如果用户进一步明确：
  “我已知晓风险，直接执行”
才进入 direct。

也就是说，真正触发切换的不是“出现风险”本身，
而是“正常法则已经收不动 + 用户仍要求继续”。</div>
    </div>
  </article>
</section>
`

writeHtml(outFile, 'AgentILS 第三章 控制法则', body)
await renderHtmlToPng(outFile, outImage, { width: 1680, height: 1200, deviceScaleFactor: 2 })
console.log(`${outFile}\n${outImage}`)
