<template>
  <el-card style="max-width: 600px; margin: 24px auto">
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span>敏感数据</span>
        <el-tag type="success">已授权</el-tag>
      </div>
    </template>
    <el-descriptions :column="1" border>
      <el-descriptions-item label="请求 ID">{{ requestId }}</el-descriptions-item>
      <el-descriptions-item label="获取时间">
        {{ new Date(fetchedAt).toLocaleString('zh-CN') }}
      </el-descriptions-item>
      <el-descriptions-item label="内容">
        <div style="white-space: pre-wrap">{{ secretData }}</div>
      </el-descriptions-item>
    </el-descriptions>
  </el-card>
</template>

<script setup lang="ts">
defineProps<{
  secretData: string
  fetchedAt: number
  requestId: string
}>()
</script>
