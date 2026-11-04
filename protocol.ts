export type Command =
  | { action: 'observe' | 'back' | 'home' | 'recents' | 'enter' | 'apps' }
  | { action: 'tap'; x: number; y: number; duration?: number }
  | { action: 'longpress'; x: number; y: number; duration: number }
  /** points：起点和终点之间的途经点（0–1），用来画出带弧度的拟人手势；旧版 App 忽略它、走直线 */
  | { action: 'swipe'; x: number; y: number; endX: number; endY: number; duration: number; points?: [number, number][] }
  | { action: 'type'; text: string }
  | { action: 'open'; packageName: string }

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT')
  return value as Record<string, unknown>
}

export function parseCommand(value: unknown): Command {
  const v = object(value)
  const unit = (n: unknown) => {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) throw new Error('INVALID_INPUT')
    return n
  }
  const coordinate = (key: string) => unit(v[key])
  /** 毫秒整数，缺省取 fallback */
  const duration = (min: number, max: number, fallback: number) => {
    const n = v.duration ?? fallback
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new Error('INVALID_INPUT')
    return n
  }
  switch (v.action) {
    case 'observe':
    case 'back':
    case 'home':
    case 'recents':
    case 'enter':
    case 'apps':
      return { action: v.action }
    case 'tap':
      return v.duration === undefined
        ? { action: 'tap', x: coordinate('x'), y: coordinate('y') }
        : { action: 'tap', x: coordinate('x'), y: coordinate('y'), duration: duration(40, 400, 80) }
    case 'longpress':
      return { action: 'longpress', x: coordinate('x'), y: coordinate('y'), duration: duration(400, 2000, 700) }
    case 'swipe': {
      const command: Command = {
        action: 'swipe',
        x: coordinate('x'),
        y: coordinate('y'),
        endX: coordinate('endX'),
        endY: coordinate('endY'),
        duration: duration(100, 2000, 500),
      }
      if (v.points === undefined) return command
      if (!Array.isArray(v.points) || v.points.length > 16) throw new Error('INVALID_INPUT')
      const points = v.points.map((point): [number, number] => {
        if (!Array.isArray(point) || point.length !== 2) throw new Error('INVALID_INPUT')
        return [unit(point[0]), unit(point[1])]
      })
      return { ...command, points }
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
