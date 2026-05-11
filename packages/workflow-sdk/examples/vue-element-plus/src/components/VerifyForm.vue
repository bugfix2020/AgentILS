<template>
  <div style="max-width: 400px; margin: 24px auto">
    <h3>身份验证</h3>
    <p style="color: #909399">请求 ID: {{ requestId }}</p>
    <p>
      请输入验证码以查看敏感数据。正确验证码：<el-tag>123456</el-tag>
    </p>
    <el-input
      v-model="code"
      placeholder="请输入 6 位验证码"
      maxlength="6"
      size="large"
      @keyup.enter="handleSubmit"
    >
      <template #append>
        <el-button :loading="loading" @click="handleSubmit">验证</el-button>
      </template>
    </el-input>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  requestId: string
  loading: boolean
}>()

const emit = defineEmits<{
  submit: [code: string]
}>()

const code = ref('')

function handleSubmit() {
  if (code.value.trim()) {
    emit('submit', code.value.trim())
  }
}
</script>
