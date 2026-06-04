const isDev = process.env.NODE_ENV !== 'production'

export const log = {
  error: (msg: string, detail?: unknown) => {
    if (isDev) console.error(msg, detail ?? '')
  },
}
