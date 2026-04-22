import { Sender } from '@ant-design/x'
import { Tag } from 'antd'

export function ComposerBox({
  value,
  onChange,
  onSubmit,
  onUseSuggestedCommand,
  placeholder,
  suggestedCommands,
  disabled,
  busy,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  onUseSuggestedCommand: (value: string) => void
  placeholder: string
  suggestedCommands: string[]
  disabled: boolean
  busy: boolean
}) {
  return (
    <section className="surface-card composer-card">
      <div className="surface-card-header">
        <p className="section-kicker">Sender</p>
        <h2>Command input</h2>
      </div>
      <Sender
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
        disabled={disabled}
        loading={busy}
        submitType="enter"
        autoSize={{ minRows: 2, maxRows: 6 }}
        footer={
          <div className="command-tag-row">
            {suggestedCommands.map((command) => (
              <Tag key={command} bordered={false} color="blue" className="command-tag" onClick={() => !disabled && onUseSuggestedCommand(command)}>
                {command}
              </Tag>
            ))}
          </div>
        }
      />
    </section>
  )
}
