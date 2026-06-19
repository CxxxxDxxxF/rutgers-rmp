const isDev = process.env.NODE_ENV !== 'production'

export const log = {
  error: (msg: string, detail?: unknown) => {
    if (isDev) {
      console.error(msg, detail ?? '')
      return
    }

    console.error(JSON.stringify({
      level: 'error',
      message: msg.replace(/:$/, ''),
      detail: safeLogDetail(detail),
    }))
  },
}

function safeLogDetail(detail: unknown) {
  if (!detail) return undefined
  if (detail instanceof Error) {
    return {
      name: detail.name,
      message: detail.message,
    }
  }
  if (typeof detail === 'object') {
    const record = detail as Record<string, unknown>
    return {
      code: typeof record.code === 'string' ? record.code : undefined,
      status: typeof record.status === 'number' || typeof record.status === 'string' ? record.status : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
    }
  }
  return String(detail)
}
