<template>
  <div style="max-width: 800px; margin: 48px auto; padding: 0 16px">
    <h2>Workflow SDK - Vue + Element Plus</h2>
    <p style="color: #909399">
      演示场景：查看 API 密钥需依次通过短信验证码 → 系统安全码 → 环境安全检测三重验证。
    </p>

    <!-- 首页表格 -->
    <template v-if="phase === 'table'">
      <h4>API 密钥列表</h4>
      <ApiKeyTable @view="handleViewKey" />
    </template>

    <!-- 工作流 Dialog -->
    <el-dialog
      v-if="phase === 'workflow'"
      :model-value="true"
      :title="selectedKey ? `查看密钥：${selectedKey.name}` : '查看密钥'"
      width="520px"
      @close="handleCancel"
    >
      <el-steps :active="step" size="small" style="margin-bottom: 24px">
        <el-step
          v-for="(node, i) in nodes"
          :key="node.id"
          :title="node.name ?? node.id"
          :status="getStepStatus(i)"
        >
          <template #icon>
            <el-tooltip :content="node.description ?? ''" placement="top">
              <el-icon :size="18">
                <component :is="iconMap[(node.config as any)?.icon] ?? InfoFilled" />
              </el-icon>
            </el-tooltip>
          </template>
        </el-step>
      </el-steps>

      <!-- 步骤 0-2：验证表单 -->
      <template v-if="step < 3">
        <el-alert
          v-if="error"
          type="error"
          show-icon
          title="验证失败"
          :description="error"
          style="margin-bottom: 16px"
        />
        <p>{{ nodes[step].description }}</p>
        <p style="color: #909399">
          正确验证码：<el-tag>{{ stepConfigs[step].hint }}</el-tag>
        </p>
        <div style="display: flex; gap: 8px">
          <el-input
            v-model="inputValue"
            :placeholder="stepConfigs[step].placeholder"
            size="large"
            @keyup.enter="handleSubmit"
          />
          <el-button type="primary" size="large" :loading="loading" @click="handleSubmit">
            {{ error ? '重新验证' : '验证' }}
          </el-button>
        </div>
        <div style="text-align: center; margin-top: 16px">
          <el-button @click="handleCancel">取消</el-button>
        </div>
      </template>

      <!-- 步骤 3：密钥展示 -->
      <template v-if="step === 3 && result">
        <el-alert
          type="success"
          show-icon
          title="所有验证通过"
          description="API 密钥已解密，请妥善保管"
          style="margin-bottom: 16px"
        />
        <el-descriptions :column="1" border>
          <el-descriptions-item label="密钥名称">{{ result.apiKeyName }}</el-descriptions-item>
          <el-descriptions-item label="请求 ID">{{ result.requestId }}</el-descriptions-item>
          <el-descriptions-item label="获取时间">
            {{ new Date(result.revealedAt).toLocaleString('zh-CN') }}
          </el-descriptions-item>
          <el-descriptions-item label="完整密钥">
            <div style="word-break: break-all">{{ result.fullApiKey }}</div>
          </el-descriptions-item>
        </el-descriptions>
        <div style="text-align: center; margin-top: 16px">
          <el-button type="primary" @click="handleCancel">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { InfoFilled, ChatDotRound, Lock, Monitor, Key } from '@element-plus/icons-vue'
import { useWorkflow } from '@agent-ils/workflow-sdk/vue'
import { apiKeyWorkflow, STEP_CONFIGS, type ApiKeyWorkflowContext } from './workflow'
import ApiKeyTable from './components/ApiKeyTable.vue'
import type { ApiKeyItem } from './components/ApiKeyTable.vue'

type Phase = 'table' | 'workflow'

const phase = ref<Phase>('table')
const selectedKey = ref<ApiKeyItem | null>(null)
const step = ref(0)
const error = ref<string | null>(null)
const result = ref<ApiKeyWorkflowContext | null>(null)
const loading = ref(false)
const inputValue = ref('')
const accumulated = ref<Record<string, string>>({})

const { start } = useWorkflow({ definition: apiKeyWorkflow })
const nodes = apiKeyWorkflow.nodes
const stepConfigs = STEP_CONFIGS

const iconMap: Record<string, any> = { ChatDotRound, Lock, Monitor, Key }

function getStepStatus(i: number): '' | 'wait' | 'process' | 'finish' | 'error' | 'success' {
  if (i < step.value) return 'success'
  if (i === step.value && error.value) return 'error'
  if (i === step.value) return 'process'
  return 'wait'
}

function handleViewKey(key: ApiKeyItem) {
  selectedKey.value = key
  step.value = 0
  error.value = null
  result.value = null
  inputValue.value = ''
  accumulated.value = {}
  phase.value = 'workflow'
}

async function handleSubmit() {
  if (!selectedKey.value || step.value >= 3 || !inputValue.value.trim()) return

  loading.value = true
  error.value = null
  const field = stepConfigs[step.value].field
  const newAcc = { ...accumulated.value, [field]: inputValue.value.trim() }
  accumulated.value = newAcc

  const res = await start({
    requestId: '',
    apiKeyId: selectedKey.value.id,
    apiKeyName: selectedKey.value.name,
    smsCode: '',
    smsVerified: false,
    systemCode: '',
    systemVerified: false,
    envCode: '',
    envVerified: false,
    fullApiKey: '',
    revealedAt: 0,
    ...newAcc,
  })

  loading.value = false

  if (res.status === 'done') {
    result.value = res.context
    step.value = 3
  } else if (res.status === 'stopped' && res.reason) {
    if (res.reason.startsWith('NEED_')) {
      step.value++
      inputValue.value = ''
    } else {
      error.value = res.reason
    }
  }
}

function handleCancel() {
  phase.value = 'table'
  selectedKey.value = null
  error.value = null
  result.value = null
  loading.value = false
}
</script>
