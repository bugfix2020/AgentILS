<template>
  <el-table :data="mockKeys" style="width: 100%">
    <el-table-column prop="name" label="密钥名称" />
    <el-table-column prop="prefix" label="前缀">
      <template #default="{ row }">
        <el-tag>{{ row.prefix }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="createdAt" label="创建时间" />
    <el-table-column prop="status" label="状态">
      <template #default="{ row }">
        <el-tag :type="row.status === 'active' ? 'success' : 'info'">
          {{ row.status === 'active' ? '启用' : '停用' }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="操作">
      <template #default="{ row }">
        <el-button type="primary" link @click="$emit('view', row)">查看</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
export interface ApiKeyItem {
  id: string
  name: string
  prefix: string
  createdAt: string
  status: 'active' | 'inactive'
}

defineEmits<{
  view: [key: ApiKeyItem]
}>()

const mockKeys: ApiKeyItem[] = [
  { id: 'key-001', name: 'Production API Key', prefix: 'sk-prod-****', createdAt: '2026-04-15', status: 'active' },
  { id: 'key-002', name: 'Staging API Key', prefix: 'sk-stag-****', createdAt: '2026-05-01', status: 'active' },
  { id: 'key-003', name: 'Test API Key', prefix: 'sk-test-****', createdAt: '2026-05-10', status: 'inactive' },
]
</script>
