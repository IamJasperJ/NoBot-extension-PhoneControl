export type Command =
  | { action: 'observe' | 'back' | 'home' | 'recents' | 'enter' | 'apps' }
  | { action: 'tap'; x: number; y: number; duration?: number }
  | { action: 'longpress'; x: number; y: number; duration: number }
  /** points：起点和终点之间的途经点（0–1），用来画出带弧度的拟人手势；旧版 App 忽略它、走直线 */
  | { action: 'swipe'; x: number; y: number; endX: number; endY: number; duration: number; points?: [number, number][] }
  /**
   * 拖动：按下 → 原地按住 hold 毫秒（0 = 不停顿，>0 = 长按后拖，如拖图标）→ 沿途经点用 duration 毫秒移到终点
   * → 在终点停 rest 毫秒再抬起（停一下才不会被当成甩动 / fling）。App 0.5.1 起支持，旧版回报 UNSUPPORTED_ACTION。
   */
  | {
      action: 'drag'
      x: number
      y: number
      endX: number
      endY: number
      hold: number
      duration: number
      rest: number
      points?: [number, number][]
    }
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
  const integer = (key: string, min: number, max: number, fallback: number) => {
    const n = v[key] === undefined ? fallback : v[key]
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
        : { action: 'tap', x: coordinate('x'), y: coordinate('y'), duration: integer('duration', 40, 400, 80) }
    case 'longpress':
      return {
        action: 'longpress',
        x: coordinate('x'),
        y: coordinate('y'),
        duration: integer('duration', 400, 2000, 700),
      }
    case 'swipe':
    case 'drag': {
      const coordinates = {
        x: coordinate('x'),
        y: coordinate('y'),
        endX: coordinate('endX'),
        endY: coordinate('endY'),
      }
      const command: Command =
        v.action === 'drag'
          ? {
              action: 'drag',
              ...coordinates,
              hold: integer('hold', 0, 2000, 0),
              duration: integer('duration', 100, 3000, 600),
              rest: integer('rest', 0, 1000, 150),
            }
          : { action: 'swipe', ...coordinates, duration: integer('duration', 100, 2000, 500) }
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
