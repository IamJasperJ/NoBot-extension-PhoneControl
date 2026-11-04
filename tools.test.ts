import { describe, expect, test } from 'bun:test'
import type { ExtensionContext } from '../../apps/server/src/extensions/types'
import { Bridge } from './bridge'
import { phoneTools } from './tools'

function context(): ExtensionContext {
  const map = new Map<string, unknown>()
  return {
    chatId: 'allowed',
    settings: { chatId: 'allowed' },
    storage: {
      get<T>(key: string) {
        return map.get(key) as T | undefined
      },
      set(key, value) {
        map.set(key, value)
      },
      delete(key) {
        map.delete(key)
      },
    },
    // 工具只依赖存储与会话授权，不应调用其他宿主能力。
    host: new Proxy({} as ExtensionContext['host'], {
      get() {
        throw new Error('UNEXPECTED_HOST_ACCESS')
      },
    }),
  }
}

describe('模型工具', () => {
  test('只提供给绑定会话，执行时再次验证会话', async () => {
    const ctx = context()
    expect(phoneTools({ ...ctx, chatId: '' })).toEqual([])
    expect(phoneTools({ ...ctx, chatId: 'other' })).toEqual([])
    const tool = phoneTools(ctx)[0]
    expect(tool).toBeDefined()
    const result = await tool?.run(
      { action: 'home' },
      { chatId: 'other', extension: ctx, vars: {}, signal: new AbortController().signal },
    )
    expect(result?.content).toBe('PHONE_ACCESS_DISABLED')
  })
  test('接收观察回报并以原生图片工具结果返回，清理缓存', async () => {
    const ctx = context()
    const bridge = new Bridge(ctx.storage)
    const pair = bridge.pair()
    bridge.poll(pair.deviceId, true)
    const tool = phoneTools(ctx)[0]
    const pending = tool?.run(
      { action: 'observe' },
      { chatId: ctx.chatId, extension: ctx, vars: {}, signal: new AbortController().signal },
    )
    const job = bridge.poll(pair.deviceId, true)
    expect(job).not.toBeNull()
    const image = Buffer.from([255, 216, 255, 217])
    bridge.finish(pair.deviceId, job?.id ?? '', { ok: true, code: 'OK', image: image.toString('base64') })
    const result = await pending
    expect(result?.images).toEqual([{ bytes: image, mime: 'image/jpeg' }])
    expect(bridge.status().job).toBeNull()
  })
  test('取消工具等待后不再派发排队指令', async () => {
    const ctx = context()
    const bridge = new Bridge(ctx.storage)
    const pair = bridge.pair()
    bridge.poll(pair.deviceId, true)
    const controller = new AbortController()
    const pending = phoneTools(ctx)[0]?.run(
      { action: 'home' },
      { chatId: ctx.chatId, extension: ctx, vars: {}, signal: controller.signal },
    )
    controller.abort()
    expect((await pending)?.content).toBe('CANCELLED')
    expect(bridge.poll(pair.deviceId, true)).toBeNull()
  })
})
