export type Command =
  | { action: 'observe' | 'back' | 'home' | 'recents' }
  | { action: 'tap'; x: number; y: number }
  | { action: 'swipe'; x: number; y: number; endX: number; endY: number; duration: number }
  | { action: 'type'; text: string }
  | { action: 'open'; packageName: string }

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT')
  return value as Record<string, unknown>
}

export function parseCommand(value: unknown): Command {
  const v = object(value)
  const coordinate = (key: string) => {
    const n = v[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) throw new Error('INVALID_INPUT')
    return n
  }
  switch (v.action) {
    case 'observe':
    case 'back':
    case 'home':
    case 'recents':
      return { action: v.action }
    case 'tap':
      return { action: 'tap', x: coordinate('x'), y: coordinate('y') }
    case 'swipe': {
      const duration = v.duration ?? 500
      if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 100 || duration > 2000)
        throw new Error('INVALID_INPUT')
      return {
        action: 'swipe',
        x: coordinate('x'),
        y: coordinate('y'),
        endX: coordinate('endX'),
        endY: coordinate('endY'),
        duration,
      }
    }
    case 'type':
      if (typeof v.text !== 'string' || !v.text.length || v.text.length > 2000) throw new Error('INVALID_INPUT')
      return { action: 'type', text: v.text }
    case 'open':
      if (
        typeof v.packageName !== 'string' ||
        v.packageName.length > 200 ||
        !/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(v.packageName)
      )
        throw new Error('INVALID_INPUT')
      return { action: 'open', packageName: v.packageName }
    default:
      throw new Error('INVALID_INPUT')
  }
}

export interface Result {
  ok: boolean
  code: string
  data?: Record<string, unknown>
  image?: string
}

export function parseResult(value: unknown): Result {
  const v = object(value)
  if (typeof v.ok !== 'boolean' || typeof v.code !== 'string' || !/^[A-Z_]{1,64}$/.test(v.code))
    throw new Error('INVALID_INPUT')
  const data = v.data === undefined ? undefined : object(v.data)
  if (data && JSON.stringify(data).length > 100_000) throw new Error('INVALID_INPUT')
  let image: string | undefined
  if (v.image !== undefined) {
    if (typeof v.image !== 'string' || v.image.length > 2_800_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(v.image))
      throw new Error('INVALID_INPUT')
    const bytes = Buffer.from(v.image, 'base64')
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
      throw new Error('INVALID_INPUT')
    image = v.image
  }
  return { ok: v.ok, code: v.code, data, image }
}
