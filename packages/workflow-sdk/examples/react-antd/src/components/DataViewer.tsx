import React from 'react'
import { Card, Descriptions, Typography, Tag } from 'antd'

interface DataViewerProps {
    secretData: string
    fetchedAt: number
    requestId: string
}

export function DataViewer({ secretData, fetchedAt, requestId }: DataViewerProps) {
    return (
        <Card title="敏感数据" style={{ maxWidth: 600, margin: '24px auto' }} extra={<Tag color="green">已授权</Tag>}>
            <Descriptions column={1} bordered>
                <Descriptions.Item label="请求 ID">{requestId}</Descriptions.Item>
                <Descriptions.Item label="获取时间">{new Date(fetchedAt).toLocaleString('zh-CN')}</Descriptions.Item>
                <Descriptions.Item label="内容">
                    <Typography.Paragraph copyable style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {secretData}
                    </Typography.Paragraph>
                </Descriptions.Item>
            </Descriptions>
        </Card>
    )
}
