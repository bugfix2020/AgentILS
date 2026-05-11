import React, { useState } from 'react'
import { Form, Input, Button, Space, Typography } from 'antd'

export interface VerifyFormProps {
    requestId: string
    onSubmit: (code: string) => void
    loading: boolean
}

export function VerifyForm({ requestId, onSubmit, loading }: VerifyFormProps) {
    const [code, setCode] = useState('')

    return (
        <div style={{ maxWidth: 400, margin: '24px auto' }}>
            <Typography.Title level={4}>身份验证</Typography.Title>
            <Typography.Paragraph type="secondary">请求 ID: {requestId}</Typography.Paragraph>
            <Typography.Paragraph>
                请输入验证码以查看敏感数据。正确验证码：<Typography.Text code>123456</Typography.Text>
            </Typography.Paragraph>
            <Form onFinish={() => onSubmit(code)}>
                <Form.Item rules={[{ required: true, message: '请输入验证码' }]}>
                    <Space.Compact style={{ width: '100%' }}>
                        <Input
                            placeholder="请输入 6 位验证码"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            maxLength={6}
                            size="large"
                        />
                        <Button type="primary" htmlType="submit" loading={loading} size="large">
                            验证
                        </Button>
                    </Space.Compact>
                </Form.Item>
            </Form>
        </div>
    )
}
