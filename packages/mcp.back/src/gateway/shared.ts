export function textResult(label: string, payload: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${label}\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    ...(isError ? { isError: true } : {}),
  }
}
