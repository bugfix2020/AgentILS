import React from 'react'
import { Table, Tag, Button } from 'antd'

export interface ApiKeyItem {
    id: string
    name: string
    prefix: string
    createdAt: string
    status: 'active' | 'inactive'
}

const MOCK_KEYS: ApiKeyItem[] = [
    { id: 'key-001', name: 'Production API Key', prefix: 'sk-prod-****', createdAt: '2026-04-15', status: 'active' },
    { id: 'key-002', name: 'Staging API Key', prefix: 'sk-stag-****', createdAt: '2026-05-01', status: 'active' },
    { id: 'key-003', name: 'Test API Key', prefix: 'sk-test-****', createdAt: '2026-05-10', status: 'inactive' },
]

export interface ApiKeyTableProps {
    onView: (apiKey: ApiKeyItem) => void
}

export function ApiKeyTable({ onView }: ApiKeyTableProps) {
    const columns = [
        { title: '密钥名称', dataIndex: 'name', key: 'name' },
        { title: '前缀', dataIndex: 'prefix', key: 'prefix', render: (v: string) => <Tag>{v}</Tag> },
        { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (s: string) => (
                <Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '启用' : '停用'}</Tag>
            ),
        },
        {
            title: '操作',
            key: 'action',
            render: (_: unknown, record: ApiKeyItem) => (
                <Button type="link" onClick={() => onView(record)}>
                    查看
                </Button>
            ),
        },
    ]

    return <Table dataSource={MOCK_KEYS} columns={columns} rowKey="id" pagination={false} />
}
