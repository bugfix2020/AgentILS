/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react'
import { useWorkflow } from '../src/react'
import { workflow } from './basic'

export function WorkflowExample() {
    const [inputValue, setInputValue] = useState('')
    const [result, setResult] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    const { status, start } = useWorkflow({
        definition: workflow,
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setResult(null)

        try {
            const workflowResult = await start({ input: inputValue })
            setResult(workflowResult)
        } catch (error) {
            setResult({ error })
        } finally {
            setLoading(false)
        }
    }

    const getStatusColor = () => {
        switch (status) {
            case 'idle':
                return 'gray'
            case 'running':
                return 'blue'
            case 'done':
                return 'green'
            case 'stopped':
                return 'orange'
            case 'failed':
                return 'red'
        }
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>Workflow Example</h1>

            <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="输入一些文字..."
                    style={{ padding: '8px', marginRight: '10px' }}
                />
                <button
                    type="submit"
                    disabled={loading || status === 'running'}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: status === 'running' ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: status === 'running' ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loading ? '处理中...' : '开始 Workflow'}
                </button>
            </form>

            <div style={{ marginBottom: '20px' }}>
                <strong>状态:</strong>
                <span
                    style={{
                        color: getStatusColor(),
                        marginLeft: '10px',
                        fontWeight: 'bold',
                    }}
                >
                    {status}
                </span>
            </div>

            {result && (
                <div
                    style={{
                        border: '1px solid #ddd',
                        padding: '15px',
                        borderRadius: '4px',
                        backgroundColor: '#f9f9f9',
                    }}
                >
                    <h3>执行结果:</h3>
                    <pre
                        style={{
                            whiteSpace: 'pre-wrap',
                            backgroundColor: '#fff',
                            padding: '10px',
                            borderRadius: '4px',
                        }}
                    >
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </div>
            )}

            <div style={{ marginTop: '20px' }}>
                <h3>使用说明:</h3>
                <ul>
                    <li>输入文字并点击按钮开始执行 workflow</li>
                    <li>Workflow 会按顺序执行 4 个节点：start → process → validate → end</li>
                    <li>每个节点都会处理并传递 context</li>
                    <li>如果输入为空，validate 节点会停止 workflow</li>
                </ul>
            </div>
        </div>
    )
}
