<template>
  <div style="padding: 20px; font-family: Arial, sans-serif">
    <h1>Workflow Vue Example</h1>

    <form @submit.prevent="handleSubmit" style="margin-bottom: 20px">
      <input
        v-model="inputValue"
        type="text"
        placeholder="输入一些文字..."
        style="padding: 8px; margin-right: 10px"
      />
      <button
        type="submit"
        :disabled="loading || status === 'running'"
        :style="buttonStyle"
      >
        {{ loading ? '处理中...' : '开始 Workflow' }}
      </button>
    </form>

    <div style="margin-bottom: 20px">
      <strong>状态:</strong>
      <span :style="statusStyle">{{ status }}</span>
    </div>

    <div v-if="result" style="border: 1px solid #ddd; padding: 15px; border-radius: 4px; background-color: #f9f9f9">
      <h3>执行结果:</h3>
      <pre style="white-space: pre-wrap; background-color: #fff; padding: 10px; border-radius: 4px">
        {{ JSON.stringify(result, null, 2) }}
      </pre>
    </div>

    <div style="margin-top: 20px">
      <h3>使用说明:</h3>
      <ul>
        <li>输入文字并点击按钮开始执行 workflow</li>
        <li>Workflow 会按顺序执行 4 个节点：start → process → validate → end</li>
        <li>每个节点都会处理并传递 context</li>
        <li>如果输入为空，validate 节点会停止 workflow</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useWorkflow } from '../src/vue';
import { workflow } from './basic';

const inputValue = ref('');
const result = ref(null);
const loading = ref(false);

const { status, start } = useWorkflow({
  definition: workflow
});

const handleSubmit = async () => {
  loading.value = true;
  result.value = null;

  try {
    const workflowResult = await start({ input: inputValue.value });
    result.value = workflowResult;
  } catch (error) {
    result.value = { error };
  } finally {
    loading.value = false;
  }
};

const getStatusColor = () => {
  switch (status) {
    case 'idle': return 'gray';
    case 'running': return 'blue';
    case 'done': return 'green';
    case 'stopped': return 'orange';
    case 'failed': return 'red';
  }
};

const statusStyle = {
  color: getStatusColor(),
  marginLeft: '10px',
  fontWeight: 'bold'
};

const buttonStyle = {
  padding: '8px 16px',
  backgroundColor: status === 'running' ? '#ccc' : '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: status === 'running' ? 'not-allowed' : 'pointer'
};
</script>