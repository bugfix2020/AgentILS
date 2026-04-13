import { resolve } from 'node:path'
import { writeHtml } from '../common/html-shared.mjs'
import { renderHtmlToPng } from '../common/render-html-to-png.mjs'

const outFile = resolve('docs/agentils/flowcharts/ch2/state-map.html')
const outImage = resolve('docs/agentils/flowcharts/ch2/state-map.png')

const body = `
<section class="hero">
  <div class="eyebrow">Chapter 2</div>
  <h1>第二章 状态图</h1>
  <div class="subtitle">
    本章不只定义状态名，还明确每个状态由谁维护、显示在哪里、控制什么，以及在流程的哪个节点生效。
  </div>
</section>

<section class="panel">
  <h2>2.1 一个时刻到底会同时发生什么</h2>
  <div class="mini-flow">
    <div class="mini-line tight">
      <div class="mini-node blue">Conversation State<br/>active_task</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node blue">Task Phase<br/>execute</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node blue">Task Status<br/>active</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node amber">Control Mode<br/>alternate</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node">Override State<br/>soft override</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node">Execution Readiness<br/>technicallyReady / boundaryApproved / policyAllowed</div>
      <div class="mini-arrow">→</div>
      <div class="mini-node">Verification Result<br/>pending</div>
    </div>
  </div>
  <p class="note" style="margin-top:14px;">
    这不是 7 选 1，而是 7 层同时成立。一个状态负责展示当前任务做到哪一步，另一个状态负责决定系统现在还能不能继续强约束执行。
  </p>
</section>

<section class="panel">
  <h2>2.2 状态不是描述，它们直接控制流程</h2>
  <div class="rail">
    <div class="rail-row">
      <div class="rail-head">Conversation State</div>
      <div class="rail-body">谁维护：
Gate / Conversation Orchestrator

显示在哪里：
插件顶层任务面板、WebView 顶部总状态

控制什么：
是否允许创建新 task，当前会话是否进入 await_next_task 或 conversation_done

在哪些节点生效：
task 完成后、用户开始新任务时、用户明确结束会话时</div>
    </div>
    <div class="rail-row">
      <div class="rail-head">Task Phase</div>
      <div class="rail-body">谁维护：
Planner / Implementer / Reviewer 在各自阶段推进时写入

显示在哪里：
插件主状态区、Task 详情、流程图主节点

控制什么：
决定下一步应该继续 collect、plan、execute 还是 verify

在哪些节点生效：
进入 collect、confirm_elements、plan、execute、verify、done 时</div>
    </div>
    <div class="rail-row">
      <div class="rail-head">Task Status</div>
      <div class="rail-body">谁维护：
运行时 orchestrator

显示在哪里：
插件状态副标题、等待用户/审批提示、错误提示

控制什么：
决定当前是继续运行、等待用户、等待审批、还是已失败

在哪些节点生效：
elicitation、approval、budget exceed、task fail、task complete</div>
    </div>
  </div>
</section>

<section class="panel">
  <h2>2.3 内部控制状态决定系统怎么做事</h2>
  <div class="rail">
    <div class="rail-row">
      <div class="rail-head">Control Mode</div>
      <div class="rail-body">谁维护：
Gate / Control Mode Orchestrator

显示在哪里：
插件次级状态区、风险说明区、summary 文档

控制什么：
决定现在是 normal、alternate 还是 direct；
进而影响是否继续强收敛、是否强制暴露风险、是否降级成用户接管

在哪些节点生效：
normal 收敛失败、用户要求继续、用户明确知晓风险时</div>
    </div>
    <div class="rail-row">
      <div class="rail-head">Override State</div>
      <div class="rail-body">谁维护：
风险确认工具 / UI action / taskCard

显示在哪里：
风险确认弹层、summary 文档、审计记录

控制什么：
记录当前 task 是否已经发生软接管或硬接管

在哪些节点生效：
用户点击继续、用户输入“我已知晓风险，继续/直接执行”时</div>
    </div>
    <div class="rail-row">
      <div class="rail-head">Execution Readiness / Verification Result</div>
      <div class="rail-body">谁维护：
Planner 在 execute 前判断；Reviewer 在 verify 后判断

显示在哪里：
执行前门禁说明、verify 结果区、summary 文档

控制什么：
前者决定“能不能开始改”；
后者决定“能不能结束当前 task”

在哪些节点生效：
plan -> execute 之前；verify -> done 或 verify -> rollback 时</div>
    </div>
  </div>
</section>

<section class="panel">
  <h2>2.4 状态优先级和边界</h2>
  <div class="decision-grid">
    <div class="decision-card">
      <h4>Task Phase != Control Mode</h4>
      <p>Task Phase 决定“当前任务做到哪一步”。
Control Mode 决定“当前系统以什么强度控制这一步”。</p>
    </div>
    <div class="decision-card">
      <h4>Task done != Conversation done</h4>
      <p>当前 task 完成后，标准行为是 await_next_task。
只有用户明确结束会话，才进入 conversation_done。</p>
    </div>
    <div class="decision-card">
      <h4>Readiness 在 execute 之前判定</h4>
      <p>technicallyReady / boundaryApproved / policyAllowed
三者共同决定“现在能不能安全开工”。</p>
    </div>
    <div class="decision-card">
      <h4>Verification 决定能否收尾</h4>
      <p>verify 通过，当前 task 才能结束。
verify 不通过，要么回 execute，要么回 plan。</p>
    </div>
  </div>
</section>

<section class="grid two">
  <article class="panel">
    <h2>2.5 建议在界面上的摆放位置</h2>
    <ul class="list">
      <li>主界面最优先展示的是：Conversation State、Task Phase、Task Status。</li>
      <li>Control Mode 是次级状态，用来解释为什么系统现在变保守了。</li>
      <li>Override、Execution Readiness、Verification Result 更偏内部控制层，不需要长期占主位。</li>
    </ul>
  </article>
  <article class="panel">
    <h2>2.6 一个真实例子</h2>
    <div class="card">
      <div class="label">例子：执行中发现影响面扩大</div>
      <div class="desc">Conversation State = active_task
Task Phase = execute
Task Status = active
Control Mode = alternate
Override State = soft override

解释：
任务仍在执行，所以 Task Phase 还是 execute。
但因为用户要求继续、信息没有完全收敛，所以 Control Mode 已经从 normal 降级成 alternate。
这时插件里应该看得到“当前在执行”，也应该看得到“当前已进入备用法则”。</div>
    </div>
  </article>
</section>
`

writeHtml(outFile, 'AgentILS 第二章 状态图', body)
await renderHtmlToPng(outFile, outImage, { width: 1680, height: 1200, deviceScaleFactor: 2 })
console.log(`${outFile}\n${outImage}`)
