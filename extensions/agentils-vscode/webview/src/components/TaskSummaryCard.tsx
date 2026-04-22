import { Col, Divider, Row } from 'antd'
import type { WebviewViewModel } from '../protocol'

export function TaskSummaryContent({ content }: { content: WebviewViewModel['content'] }) {
  const detailRows = [
    ['User message', content.userVisibleMessage],
    ['Plan', content.planSummary],
    ['Execution', content.executionResult],
    ['Test', content.testResult],
    ['Final summary', content.finalSummary],
  ].filter(([, value]) => Boolean(value))

  return (
    <div className="task-summary-content">
      <pre className="summary-block">{content.summary}</pre>

      {Array.isArray(content.risks) && content.risks.length > 0 ? (
        <div className="detail-group">
          <Divider orientation="left">Risks</Divider>
          <ul className="bullet-list">
            {content.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {detailRows.length > 0 ? (
        <Row gutter={[12, 12]} className="detail-group detail-grid">
          {detailRows.map(([label, value]) => (
            <Col key={label} xs={24} md={12}>
              <div className="detail-tile">
                <p className="detail-label">{label}</p>
                <pre>{value}</pre>
              </div>
            </Col>
          ))}
        </Row>
      ) : null}
    </div>
  )
}
