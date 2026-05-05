import { Box, Text } from 'ink'
import React from 'react'
import type { StepState } from './steps.js'

export interface EcamPanelProps {
    steps: StepState[]
    done: boolean
    failed: boolean
    phase: string
}

export function EcamPanel({ steps, done, failed, phase }: EcamPanelProps): React.JSX.Element {
    const headerColor = failed ? 'red' : done ? 'green' : 'cyan'
    return (
        <Box flexDirection="column">
            <Box>
                <Text color={headerColor} bold>
                    {`AGENTILS PRE-COMMIT GATE  [${phase}]`}
                </Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
                {steps.map((step, index) => (
                    <Text key={index} color={statusColor(step.status)}>
                        {`  ${statusGlyph(step.status)} ${step.label}`}
                        {step.tail ? `  — ${step.tail.split('\n').pop()}` : ''}
                    </Text>
                ))}
            </Box>
            {done && (
                <Box marginTop={1}>
                    <Text color={failed ? 'red' : 'green'} bold>
                        {failed ? 'GATE FAILED' : 'GATE PASSED'}
                    </Text>
                </Box>
            )}
        </Box>
    )
}

function statusGlyph(status: StepState['status']): string {
    switch (status) {
        case 'running':
            return '…'
        case 'passed':
            return '✓'
        case 'failed':
            return '✗'
        default:
            return '·'
    }
}

function statusColor(status: StepState['status']): string {
    switch (status) {
        case 'running':
            return 'yellow'
        case 'passed':
            return 'green'
        case 'failed':
            return 'red'
        default:
            return 'gray'
    }
}
