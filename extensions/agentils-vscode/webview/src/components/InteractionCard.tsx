import { useState } from 'react'
import { Button, Flex, Input, Tag } from 'antd'
import type { InteractionActionId, WebviewViewModel } from '../protocol'

export function InteractionContent({
  interaction,
  busy,
  placeholder,
  onSubmit,
}: {
  interaction: WebviewViewModel['interaction']
  busy: boolean
  placeholder: string
  onSubmit: (actionId?: InteractionActionId, message?: string) => void
}) {
  const [note, setNote] = useState('')

  if (!interaction.exists) {
    return null
  }

  return (
    <div className="interaction-content">
      {interaction.description ? (
        <div className="interaction-description">
          <pre>{interaction.description}</pre>
        </div>
      ) : null}
      <Flex className="interaction-meta" gap={10} wrap>
        <Tag className="badge">kind {interaction.kind}</Tag>
        <Tag className="badge">reopen {interaction.reopenCount ?? 0}</Tag>
      </Flex>
      <Input.TextArea
        className="interaction-textarea"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={placeholder}
        disabled={busy}
        autoSize={{ minRows: 3, maxRows: 8 }}
      />
      <Flex className="action-row" gap={10} wrap>
        {interaction.actions.map((action) => (
          <Button
            key={action.id}
            type="primary"
            className="primary-button"
            disabled={busy}
            onClick={() => onSubmit(action.id, note)}
          >
            {action.label}
          </Button>
        ))}
      </Flex>
    </div>
  )
}
