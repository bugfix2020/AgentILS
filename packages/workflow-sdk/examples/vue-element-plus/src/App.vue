<template>
  <div style="max-width: 720px; margin: 48px auto; padding: '0 16px'">
    <h2>Workflow SDK - Vue + Element Plus</h2>
    <p style="color: #909399">
      演示场景：查看敏感数据前需要验证码鉴权。验证码错误时工作流中断，后续步骤不执行。
    </p>

    <el-steps
      :active="currentStep"
      :status="stepStatus"
      finish-status="success"
      style="margin-bottom: 32px"
    >
      <el-step title="初始化" />
      <el-step title="身份验证" />
      <el-step title="获取数据" />
      <el-step title="完成" />
    </el-steps>

    <!-- 空闲 → 查看按钮 + 验证表单 -->
    <template v-if="phase === 'idle'">
      <div style="text-align: center; padding: 24px">
        <el-button type="primary" size="large" @click="showForm = true">
          查看敏感数据
        </el-button>
      </div>
    </template>

    <!-- 验证表单 -->
    <template v-if="phase === 'idle' && showForm">
      <VerifyForm
        request-id="pending..."
        :loading="loading"
        @submit="handleVerify"
      />
    </template>

    <!-- 运行中 -->
    <template v-if="phase === 'running'">
      <div style="text-align: center; padding: 48px">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>执行中...</p>
        <el-button type="danger" @click="handleAbort">取消</el-button>
      </div>
    </template>

    <!-- 中断 -->
    <template v-if="phase === 'stopped'">
      <el-alert
        type="error"
        show-icon
        closable
        title="工作流已中断"
        :description="failedReason"
        style="margin-bottom: 24px"
        @close="handleReset"
      />
      <VerifyForm
        request-id="(重新验证)"
        :loading="loading"
        @submit="handleVerify"
      />
    </template>

    <!-- 成功 -->
    <template v-if="phase === 'done' && result">
      <DataViewer
        :secret-data="result.secretData"
        :fetched-at="result.fetchedAt"
        :request-id="result.requestId"
      />
      <div style="text-align: center; margin-top: 24px">
        <el-button @click="handleReset">重新开始</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useWorkflow } from '@agent-ils/workflow-sdk/vue'
import { authWorkflow, type AuthWorkflowContext } from './workflow'
import VerifyForm from './components/VerifyForm.vue'
import DataViewer from './components/DataViewer.vue'

const showForm = ref(false)
const loading = ref(false)
const failedReason = ref<string | null>(null)
const result = ref<AuthWorkflowContext | null>(null)

const { status, start, abort } = useWorkflow({ definition: authWorkflow })

type Phase = 'idle' | 'running' | 'stopped' | 'done' | 'failed'
const phase = computed<Phase>(() => {
  if (status === 'idle' && !result.value && !failedReason.value) return 'idle'
  if (status === 'running') return 'running'
  if (status === 'stopped') return 'stopped'
  if (status === 'failed') return 'failed'
  if (status === 'done') return 'done'
  return 'idle'
})

const currentStep = computed(() => {
  if (phase.value === 'idle') return -1
  if (phase.value === 'running') return 0
  if (phase.value === 'stopped' || phase.value === 'failed') return 1
  if (phase.value === 'done') return 3
  return 0
})

const stepStatus = computed(() => {
  if (phase.value === 'stopped' || phase.value === 'failed') return 'error'
  return 'process'
})

async function handleVerify(code: string) {
  loading.value = true
  failedReason.value = null
  result.value = null
  showForm.value = false

  const res = await start({
    requestId: '',
    code,
    secretData: '',
    fetchedAt: 0,
    completed: false,
  })

  loading.value = false
  if (res.status === 'done') {
    result.value = res.context
  } else if (res.status === 'stopped') {
    failedReason.value = res.reason ?? '未知原因'
  } else if (res.status === 'failed') {
    failedReason.value = `执行异常: ${String(res.error)}`
  }
}

function handleAbort() {
  abort()
}

function handleReset() {
  result.value = null
  failedReason.value = null
  showForm.value = true
}
</script>
