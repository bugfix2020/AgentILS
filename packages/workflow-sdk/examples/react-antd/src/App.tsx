import { useState, useCallback, useMemo } from 'react'
import { Layout, Steps, Button, Alert, Typography, Tooltip, Modal, Input, Descriptions } from 'antd'
import {
    InfoCircleOutlined,
    SafetyCertificateOutlined,
    KeyOutlined,
    MessageOutlined,
    SecurityScanOutlined,
} from '@ant-design/icons'
import { useWorkflow } from '@agent-ils/workflow-sdk/react'
import { apiKeyWorkflow, STEP_CONFIGS, type ApiKeyWorkflowContext } from './workflow'
import { ApiKeyTable, type ApiKeyItem } from './components/ApiKeyTable'

const ICON_MAP: Record<string, React.ReactNode> = {
    MessageOutlined: <MessageOutlined />,
    SafetyCertificateOutlined: <SafetyCertificateOutlined />,
    SecurityScanOutlined: <SecurityScanOutlined />,
    KeyOutlined: <KeyOutlined />,
}

export default function App() {
    const [phase, setPhase] = useState<'table' | 'workflow'>('table')
    const [selectedKey, setSelectedKey] = useState<ApiKeyItem | null>(null)
    const [step, setStep] = useState(0) // 0=sms, 1=system, 2=env, 3=reveal
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<ApiKeyWorkflowContext | null>(null)
    const [loading, setLoading] = useState(false)
    const [inputValue, setInputValue] = useState('')
    const [accumulated, setAccumulated] = useState<Record<string, string>>({})

    const { start } = useWorkflow({ definition: apiKeyWorkflow })
    const nodes = apiKeyWorkflow.nodes

    // Steps 渲染配置
    const stepsItems = useMemo(
        () =>
            nodes.map((node, i) => ({
                title: node.name,
                icon: (
                    <Tooltip title={node.description}>
                        {ICON_MAP[(node.config as { icon: string })?.icon] ?? <InfoCircleOutlined />}
                    </Tooltip>
                ),
                status:
                    i < step
                        ? ('finish' as const)
                        : i === step && error
                          ? ('error' as const)
                          : i === step
                            ? ('process' as const)
                            : ('wait' as const),
            })),
        [step, error, nodes],
    )

    // 点击「查看」→ 进入工作流
    const handleViewKey = useCallback((key: ApiKeyItem) => {
        setSelectedKey(key)
        setStep(0)
        setError(null)
        setResult(null)
        setInputValue('')
        setAccumulated({})
        setPhase('workflow')
    }, [])

    // 提交当前步骤
    const handleSubmit = useCallback(async () => {
        if (!selectedKey || step >= 3 || !inputValue.trim()) return

        setLoading(true)
        setError(null)
        const field = STEP_CONFIGS[step].field
        const newAcc = { ...accumulated, [field]: inputValue.trim() }
        setAccumulated(newAcc)

        const res = await start({
            requestId: '',
            apiKeyId: selectedKey.id,
            apiKeyName: selectedKey.name,
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

        setLoading(false)

        if (res.status === 'done') {
            setResult(res.context)
            setStep(3)
        } else if (res.status === 'stopped' && res.reason) {
            if (res.reason.startsWith('NEED_')) {
                // 当前步骤通过，下一步骤等待输入
                setStep((s) => s + 1)
                setInputValue('')
            } else {
                setError(res.reason)
            }
        }
    }, [selectedKey, step, inputValue, accumulated, start])

    // 取消 → 返回列表
    const handleCancel = useCallback(() => {
        setPhase('table')
        setSelectedKey(null)
        setError(null)
        setResult(null)
        setLoading(false)
    }, [])

    return (
        <Layout style={{ minHeight: '100vh', padding: 48 }}>
            <Layout.Content style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
                <Typography.Title level={2}>Workflow SDK - API Key 管理</Typography.Title>
                <Typography.Paragraph type="secondary">
                    演示场景：查看 API 密钥需依次通过短信验证码 → 系统安全码 → 环境安全检测三重验证。
                </Typography.Paragraph>

                {/* ── 首页表格 ── */}
                {phase === 'table' && (
                    <>
                        <Typography.Title level={4}>API 密钥列表</Typography.Title>
                        <ApiKeyTable onView={handleViewKey} />
                    </>
                )}

                {/* ── 工作流 Modal ── */}
                {phase === 'workflow' && (
                    <Modal
                        open
                        onCancel={handleCancel}
                        footer={null}
                        width={520}
                        title={selectedKey ? `查看密钥：${selectedKey.name}` : '查看密钥'}
                    >
                        <Steps current={step} items={stepsItems} size="small" style={{ marginBottom: 24 }} />

                        {/* 步骤 0-2：验证表单 */}
                        {step < 3 && (
                            <div style={{ marginTop: 16 }}>
                                {error && (
                                    <Alert
                                        type="error"
                                        showIcon
                                        message="验证失败"
                                        description={error}
                                        style={{ marginBottom: 16 }}
                                    />
                                )}
                                <Typography.Paragraph>{nodes[step].description}</Typography.Paragraph>
                                <Typography.Paragraph type="secondary">
                                    正确验证码：<Typography.Text code>{STEP_CONFIGS[step].hint}</Typography.Text>
                                </Typography.Paragraph>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Input
                                        placeholder={STEP_CONFIGS[step].placeholder}
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onPressEnter={handleSubmit}
                                        size="large"
                                        style={{ flex: 1 }}
                                    />
                                    <Button type="primary" size="large" loading={loading} onClick={handleSubmit}>
                                        {error ? '重新验证' : '验证'}
                                    </Button>
                                </div>
                                <div style={{ textAlign: 'center', marginTop: 16 }}>
                                    <Button onClick={handleCancel}>取消</Button>
                                </div>
                            </div>
                        )}

                        {/* 步骤 3：密钥展示 */}
                        {step === 3 && result && (
                            <div style={{ marginTop: 16 }}>
                                <Alert
                                    type="success"
                                    showIcon
                                    message="所有验证通过"
                                    description="API 密钥已解密，请妥善保管"
                                    style={{ marginBottom: 16 }}
                                />
                                <Descriptions column={1} bordered>
                                    <Descriptions.Item label="密钥名称">{result.apiKeyName}</Descriptions.Item>
                                    <Descriptions.Item label="请求 ID">{result.requestId}</Descriptions.Item>
                                    <Descriptions.Item label="获取时间">
                                        {new Date(result.revealedAt).toLocaleString('zh-CN')}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="完整密钥">
                                        <Typography.Paragraph copyable style={{ margin: 0, wordBreak: 'break-all' }}>
                                            {result.fullApiKey}
                                        </Typography.Paragraph>
                                    </Descriptions.Item>
                                </Descriptions>
                                <div style={{ textAlign: 'center', marginTop: 16 }}>
                                    <Button type="primary" onClick={handleCancel}>
                                        关闭
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Modal>
                )}
            </Layout.Content>
        </Layout>
    )
}
