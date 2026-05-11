import { useState, useCallback } from 'react'
import { Layout, Steps, Button, Alert, Typography, Spin } from 'antd'
import { useWorkflow } from '@agent-ils/workflow-sdk/react'
import { authWorkflow, type AuthWorkflowContext } from './workflow'
import { VerifyForm } from './components/VerifyForm'
import { DataViewer } from './components/DataViewer'

const STEP_LABELS = ['初始化', '身份验证', '获取数据', '完成']

export default function App() {
    const [result, setResult] = useState<AuthWorkflowContext | null>(null)
    const [failedReason, setFailedReason] = useState<string | null>(null)
    const [verifying, setVerifying] = useState(false)
    const [showForm, setShowForm] = useState(false)

    const { status, start, abort } = useWorkflow({
        definition: authWorkflow,
    })

    // 当前步骤索引（用于 Steps 组件）
    const currentStep = (() => {
        if (status === 'idle') return -1
        if (status === 'running') {
            // running 时不知道在哪个节点，用简易判断
            if (result) return 3
            return 0
        }
        if (status === 'stopped') return 1 // 中断一定在 verify
        if (status === 'failed') return 0
        if (status === 'done') return 3
        return 0
    })()

    // 点击「查看敏感数据」按钮 → 显示验证码表单
    const handleView = useCallback(() => {
        setResult(null)
        setFailedReason(null)
        setShowForm(true)
    }, [])

    const handleVerify = useCallback(
        async (code: string) => {
            setVerifying(true)
            setFailedReason(null)
            setShowForm(false)
            const res = await start({
                requestId: '',
                code,
                secretData: '',
                fetchedAt: 0,
                completed: false,
            })
            setVerifying(false)
            if (res.status === 'done') {
                setResult(res.context)
            } else if (res.status === 'stopped') {
                setFailedReason(res.reason ?? '未知原因')
            } else if (res.status === 'failed') {
                setFailedReason(`执行异常: ${String(res.error)}`)
            }
        },
        [start],
    )

    const handleReset = useCallback(() => {
        setResult(null)
        setFailedReason(null)
        setShowForm(true)
    }, [])

    return (
        <Layout style={{ minHeight: '100vh', padding: 48 }}>
            <Layout.Content style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
                <Typography.Title level={2}>Workflow SDK - React + Antd</Typography.Title>
                <Typography.Paragraph type="secondary">
                    演示场景：查看敏感数据前需要验证码鉴权。验证码错误时工作流中断，后续步骤不执行。
                </Typography.Paragraph>

                <Steps
                    current={currentStep}
                    status={status === 'stopped' ? 'error' : status === 'failed' ? 'error' : 'process'}
                    items={STEP_LABELS.map((title) => ({ title }))}
                    style={{ marginBottom: 32 }}
                />

                {/* 空闲状态 → 显示查看按钮 */}
                {status === 'idle' && !showForm && !failedReason && (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                        <Button type="primary" size="large" onClick={handleView}>
                            查看敏感数据
                        </Button>
                    </div>
                )}

                {/* 查看按钮点击后 / 重新验证 → 显示验证码表单 */}
                {showForm && (
                    <VerifyForm
                        requestId={failedReason ? '(重新验证)' : 'pending...'}
                        onSubmit={handleVerify}
                        loading={verifying}
                    />
                )}

                {/* 运行中 */}
                {status === 'running' && (
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <Spin size="large" tip="执行中..." />
                        <div style={{ marginTop: 16 }}>
                            <Button danger onClick={abort}>
                                取消
                            </Button>
                        </div>
                    </div>
                )}

                {/* 中断 / 失败 */}
                {failedReason && (
                    <Alert
                        type="error"
                        showIcon
                        closable
                        message="工作流已中断"
                        description={failedReason}
                        style={{ marginBottom: 24 }}
                        onClose={handleReset}
                    />
                )}

                {/* 成功 → 展示数据 */}
                {result && result.completed && (
                    <>
                        <DataViewer
                            secretData={result.secretData}
                            fetchedAt={result.fetchedAt}
                            requestId={result.requestId}
                        />
                        <div style={{ textAlign: 'center', marginTop: 24 }}>
                            <Button onClick={handleReset}>重新开始</Button>
                        </div>
                    </>
                )}
            </Layout.Content>
        </Layout>
    )
}
