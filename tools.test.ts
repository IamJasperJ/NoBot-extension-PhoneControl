import { beforeAll, describe, expect, test } from 'bun:test'
import type { ExtensionContext } from '../../apps/server/src/extensions/types'
import { Bridge } from './bridge'
import { currentTask, memoryPrompt, policyOf, recentMemories, settingsOf, stopAll, timing } from './tasks'
import { phoneTools } from './tools'

function context(
  settings: Record<string, unknown> = {},
  host: Partial<ExtensionContext['host']> = {},
): ExtensionContext {
  const map = new Map<string, unknown>()
  return {
    chatId: 'allowed',
    settings: { chatId: 'allowed', ...settings },
    storage: {
      get<T>(key: string) {
        return map.get(key) as T | undefined
      },
      set(key, value) {
        map.set(key, structuredClone(value))
      },
      delete(key) {
        map.delete(key)
      },
    },
    // 只允许用到测试里给出的宿主能力
    host: new Proxy(host as ExtensionContext['host'], {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target]
        throw new Error(`UNEXPECTED_HOST_ACCESS ${String(key)}`)
      },
    }),
  }
}
const toolCtx = (ctx: ExtensionContext, signal = new AbortController().signal) => ({
  chatId: ctx.chatId,
  extension: ctx,
  vars: {},
  signal,
})
const tool = (ctx: ExtensionContext, name: string) => phoneTools(ctx).find((t) => t.name === name)

/** 模拟手机：不停轮询，按指令回报；observe 回一个有两个按钮的界面 */
function fakePhone(bridge: Bridge, deviceId: string, log: string[]) {
  let stopped = false
  void (async () => {
    while (!stopped) {
      const job = bridge.poll(deviceId, true)
      if (job) {
        log.push(job.command.action)
        const data =
          job.command.action === 'observe'
            ? {
                width: 1000,
                height: 2000,
                packageName: 'tv.danmaku.bili',
                nodes: [
                  { text: '推荐', clickable: true, bounds: [0, 100, 200, 200] },
                  { text: '搜索', clickable: true, editable: true, bounds: [300, 100, 900, 200] },
                  { text: '猫猫视频', clickable: false, bounds: [0, 400, 1000, 600] },
                ],
              }
            : undefined
        bridge.finish(deviceId, job.id, {
          ok: true,
          code: 'OK',
          data,
          image: job.command.action === 'observe' ? Buffer.from([255, 216, 255, 217]).toString('base64') : undefined,
        })
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  })()
  return () => {
    stopped = true
  }
}

beforeAll(() => {
  timing.scale = 0
})

describe('模型工具', () => {
  test('只提供给绑定会话；默认只有 phone_task，开启直接操作才有 phone_control', async () => {
    const ctx = context()
    expect(phoneTools({ ...ctx, chatId: '' })).toEqual([])
    expect(phoneTools({ ...ctx, chatId: 'other' })).toEqual([])
    expect(phoneTools(ctx).map((t) => t.name)).toEqual(['phone_task'])
    expect(phoneTools(context({ directTool: true })).map((t) => t.name)).toEqual(['phone_task', 'phone_control'])
    const result = await tool(ctx, 'phone_task')?.run({ goal: 'x', wait: true }, { ...toolCtx(ctx), chatId: 'other' })
    expect(result?.content).toBe('PHONE_ACCESS_DISABLED')
  })

  test('phone_control 接收观察回报并以原生图片返回，清理缓存', async () => {
    const ctx = context({ directTool: true })
    const bridge = new Bridge(ctx.storage)
    const pair = bridge.pair()
    bridge.poll(pair.deviceId, true)
    const pending = tool(ctx, 'phone_control')?.run({ action: 'observe' }, toolCtx(ctx))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const job = bridge.poll(pair.deviceId, true)
    expect(job).not.toBeNull()
    const image = Buffer.from([255, 216, 255, 217])
    bridge.finish(pair.deviceId, job?.id ?? '', { ok: true, code: 'OK', image: image.toString('base64') })
    const result = await pending
    expect(result?.images).toEqual([{ bytes: image, mime: 'image/jpeg' }])
    expect(bridge.status().job).toBeNull()
  })

  test('phone_control 取消后不再派发排队指令', async () => {
    const ctx = context({ directTool: true })
    const bridge = new Bridge(ctx.storage)
    const pair = bridge.pair()
    bridge.poll(pair.deviceId, true)
    const controller = new AbortController()
    const pending = tool(ctx, 'phone_control')?.run({ action: 'home' }, toolCtx(ctx, controller.signal))
    controller.abort()
    expect((await pending)?.content).toBe('CANCELLED')
    expect(bridge.poll(pair.deviceId, true)).toBeNull()
  })

  test('phone_task：手机离线时直接说明，不启动任务', async () => {
    const ctx = context()
    new Bridge(ctx.storage).pair()
    const result = await tool(ctx, 'phone_task')?.run({ goal: '刷 B 站', wait: false }, toolCtx(ctx))
    expect(result?.content).toStartWith('DEVICE_OFFLINE')
    expect(currentTask(ctx.storage)).toBeNull()
  })

  test('phone_task 同步模式：操作员一路做到 done，回报经历和最后的截图，并记进近期记忆', async () => {
    const replies = [
      '```json\n{"thought":"先看推荐","action":{"type":"tap","element":1}}\n```',
      '{"thought":"往下翻翻","action":{"type":"scroll","direction":"down","distance":"medium"},"memory":"刷到一个猫猫视频"}',
      '{"thought":"够了","action":{"type":"done","summary":"看了推荐页，刷到一个猫猫视频。"}}',
    ]
    const prompts: string[] = []
    const ctx = context(
      {},
      {
        getChatInfo: (() => ({
          characters: [{ id: 'c1', name: '小雪', personality: '喜欢猫', description: '' }],
        })) as unknown as ExtensionContext['host']['getChatInfo'],
        complete: async (opts) => {
          prompts.push(opts.messages.at(-1)?.content ?? '')
          return replies.shift() ?? '{"action":{"type":"done","summary":""}}'
        },
      },
    )
    const bridge = new Bridge(ctx.storage)
    const pair = bridge.pair()
    bridge.poll(pair.deviceId, true)
    const actions: string[] = []
    const stop = fakePhone(bridge, pair.deviceId, actions)
    try {
      const result = await tool(ctx, 'phone_task')?.run({ goal: '刷会儿 B 站', wait: true }, toolCtx(ctx))
      expect(result?.content).toContain('Phone task finished')
      expect(result?.content).toContain('猫猫视频')
      expect(result?.images?.length).toBe(1)
      expect(actions).toEqual(['observe', 'tap', 'observe', 'swipe', 'observe'])
      // 操作员看到的是编号元素和屏幕文字，不是聊天历史
      expect(prompts[0]).toContain('[1] "推荐"')
      expect(prompts[0]).toContain('[2] "搜索" (text field)')
      expect(prompts[0]).toContain('猫猫视频')
      expect(currentTask(ctx.storage)?.status).toBe('done')
      expect(currentTask(ctx.storage)?.steps.length).toBe(3)
      expect(recentMemories(ctx.storage)[0]?.memories).toEqual(['刷到一个猫猫视频'])
      expect(memoryPrompt(ctx.storage, Date.now())).toContain('刷会儿 B 站')
    } finally {
      stop()
    }
  })

  test('phone_task 后台模式立即返回；同时再要一个任务时说明正忙；停止后不打扰角色', async () => {
    let release = () => {}
    const ctx = context(
      {},
      {
        getChatInfo: (() => ({
          characters: [{ id: 'c1', name: '小雪', personality: '', description: '' }],
        })) as unknown as ExtensionContext['host']['getChatInfo'],
        // 模型一直不回答，任务保持运行
        complete: (opts) =>
          new Promise<string>((_, reject) => {
            release = () => reject(new Error('CANCELLED'))
            opts.signal?.addEventListener('abort', () => reject(new Error('CANCELLED')))
          }),
        log: () => {},
        trigger: () => {
          throw new Error('SHOULD_NOT_TRIGGER')
        },
      },
    )
    const bridge = new Bridge(ctx.storage)
    const pair = bridge.pair()
    bridge.poll(pair.deviceId, true)
    const stop = fakePhone(bridge, pair.deviceId, [])
    try {
      const first = await tool(ctx, 'phone_task')?.run({ goal: '刷小红书', wait: false }, toolCtx(ctx))
      expect(first?.content).toContain('Started using the phone in the background')
      expect(currentTask(ctx.storage)?.status).toBe('running')
      const second = await tool(ctx, 'phone_task')?.run({ goal: '看微信', wait: true }, toolCtx(ctx))
      expect(second?.content).toBe('PHONE_BUSY: you are already using the phone for: 刷小红书')
      stopAll()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(currentTask(ctx.storage)?.status).toBe('stopped')
    } finally {
      release()
      stop()
    }
  })
})

test('设置转换成操作限制：默认全部禁止；名单按换行或逗号分隔', () => {
  expect(policyOf(settingsOf({}))).toEqual({ allowed: [], blockedApps: [], blockedWords: [] })
  expect(
    policyOf(
      settingsOf({
        allowLike: true,
        allowSystem: true,
        blockedApps: '支付宝\n com.tencent.mm ,',
        blockedWords: '抽奖，红包',
      }),
    ),
  ).toEqual({ allowed: ['like', 'system'], blockedApps: ['支付宝', 'com.tencent.mm'], blockedWords: ['抽奖', '红包'] })
})

test('phone_control 开启后把解析的 drag 指令放进队列', async () => {
  const ctx = context({ directTool: true })
  const bridge = new Bridge(ctx.storage)
  const pair = bridge.pair()
  bridge.poll(pair.deviceId, true)
  const direct = tool(ctx, 'phone_control')!
  expect(direct.parameters).toMatchObject({
    properties: {
      action: { enum: expect.arrayContaining(['drag']) },
      duration: { maximum: 3000 },
      hold: { type: 'integer', minimum: 0, maximum: 2000 },
      rest: { type: 'integer', minimum: 0, maximum: 1000 },
    },
  })
  for (const extra of [{}, { hold: 800, duration: 3000, rest: 200 }]) {
    const args = { action: 'drag' as const, x: 0.2, y: 0.5, endX: 0.8, endY: 0.5, ...extra }
    const pending = direct.run(args, toolCtx(ctx))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const job = bridge.poll(pair.deviceId, true)
    expect(job?.command).toEqual({ hold: 0, duration: 600, rest: 150, ...args })
    bridge.finish(pair.deviceId, job?.id ?? '', { ok: true, code: 'OK' })
    expect((await pending).content).toBe('{"ok":true,"code":"OK"}')
  }
})

test('phone_control 按调用时的密码权限过滤标记，只有明确 true 才传下去', async () => {
  const ctx = context({ directTool: true })
  const direct = tool(ctx, 'phone_control')!
  expect(direct.parameters).toMatchObject({ properties: { password: { type: 'boolean' } } })
  expect(direct.description).toContain(
    'password: true lets type fill a password field, only when the owner allows it in the settings.',
  )
  const bridge = new Bridge(ctx.storage)
  const pair = bridge.pair()
  bridge.poll(pair.deviceId, true)
  for (const allowPassword of [false, true]) {
    ctx.settings.allowPassword = allowPassword
    for (const password of [undefined, true, false, 'true', null]) {
      const pending = direct.run({ action: 'type', text: 'secret', password }, toolCtx(ctx))
      await new Promise((resolve) => setTimeout(resolve, 0))
      const job = bridge.poll(pair.deviceId, true)
      expect(job?.command).toEqual({
        action: 'type',
        text: 'secret',
        ...(allowPassword && password === true ? { password: true } : {}),
      })
      bridge.finish(pair.deviceId, job?.id ?? '', { ok: true, code: 'OK' })
      expect((await pending).content).toBe('{"ok":true,"code":"OK"}')
    }
  }
})
