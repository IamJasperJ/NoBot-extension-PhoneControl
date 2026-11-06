import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import type { Context, Hono } from '../../apps/server/node_modules/hono'
import type { ExtensionContext, ExtensionStorage } from '../../apps/server/src/extensions/types'
import { Bridge, parseResumed } from './bridge'
import { connections } from './host'
import { type RoutinePlan, routineOf } from './life'
import { type DiaryEntry, type PhoneProfile, profileOf, validNotes } from './profile'
import type { PhoneNotification } from './protocol'
import { object, parseCommand, parseNotifications, parseResult } from './protocol'
import { currentTask, recentMemories, settingsOf, stopTask, timing } from './tasks'

/** 限制实际读取字节，不信任客户端声明的 Content-Length。 */
async function body(c: Context, limit = 16_384) {
  const reader = c.req.raw.body?.getReader()
  if (!reader) throw new Error('INVALID_INPUT')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('PAYLOAD_TOO_LARGE')
      chunks.push(value)
    }
    return object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** 内网与 VPN 段（含 Tailscale 用的 100.64.0.0/10），与安卓端 Endpoint.isPrivate 的 IPv4 部分一致。 */
export function isPrivateIpv4(address: string) {
  const [a = -1, b = -1] = address.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

/**
 * 本机可供手机连接的地址，页面在 localhost 打开时用来推荐入口。
 * Docker 容器里的网卡地址手机访问不到，宁可不给也不误导。
 */
export function localAddresses(interfaces = networkInterfaces(), inDocker = existsSync('/.dockerenv')) {
  if (inDocker) return []
  const result = new Set<string>()
  for (const list of Object.values(interfaces))
    for (const item of list ?? [])
      if (item.family === 'IPv4' && !item.internal && isPrivateIpv4(item.address)) result.add(item.address)
  return [...result]
}

type Translate = (key: string) => string

/** 管理端 GET /life 的响应；通知按时间倒序，plan 为当天时段。 */
export interface LifeResponse {
  profile: PhoneProfile
  diary: DiaryEntry[]
  notifications: PhoneNotification[]
  routine: { plan: RoutinePlan['windows']; todayCount: number; lastDecision?: RoutinePlan['lastDecision'] }
}
export interface ProfileNotesInput {
  notes: string[]
}
export interface MutationResponse {
  ok: true
}

/** 操作员任务的查看 / 停止，以及设置表单的连接、模型候选 */
export function registerTaskRoutes(app: Hono, ctx: Omit<ExtensionContext, 'chatId'>, t: Translate) {
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  app.get('/life', (c) => {
    const plan = routineOf({ ...ctx, chatId: '' }, timing.now())
    const result: LifeResponse = {
      profile: profileOf(ctx.storage),
      diary: ctx.storage.get<DiaryEntry[]>('diary') ?? [],
      notifications: (ctx.storage.get<PhoneNotification[]>('notifications') ?? [])
        .filter((n) => timing.now() - n.at <= 3 * 86400_000)
        .slice(-50)
        .reverse(),
      routine: { plan: plan.windows, todayCount: plan.todayCount, lastDecision: plan.lastDecision },
    }
    return c.json(result)
  })
  app.post('/profile/notes', async (c) => {
    try {
      const input = await body(c)
      if (!validNotes(input.notes)) throw new Error('INVALID_INPUT')
      ctx.storage.set('profile', {
        ...profileOf(ctx.storage),
        notes: [...new Set(input.notes)],
        updatedAt: timing.now(),
      })
      return c.json({ ok: true } satisfies MutationResponse)
    } catch {
      return c.json({ code: 'INVALID_INPUT', message: t('请求无效') }, 400)
    }
  })
  app.post('/notifications/clear', (c) => {
    ctx.storage.delete('notifications')
    ctx.storage.delete('notificationPending')
    return c.json({ ok: true } satisfies MutationResponse)
  })
  app.get('/task', (c) => c.json({ task: currentTask(ctx.storage), memories: recentMemories(ctx.storage) }))
  app.post('/task/stop', (c) => {
    stopTask(ctx.storage)
    return c.json({ ok: true })
  })
  app.post('/connections', async (c) =>
    c.json({
      options: [
        { value: '', label: t('跟随会话') },
        ...(await connections())
          .listApiPresets()
          .map((v) => ({ value: v.id, label: v.vision === 'no' ? `${v.name} (${t('不支持看图')})` : v.name })),
      ],
    }),
  )
  app.post('/models', async (c) => {
    const body = await c.req
      .json<{ settings?: Record<string, unknown> }>()
      .catch(() => ({}) as { settings?: Record<string, unknown> })
    const s = settingsOf({ ...ctx.settings, ...(body.settings ?? {}) })
    const host = await connections()
    const id = s.operatorConnectionId || host.listApiPresets().find((v) => v.isDefault)?.id
    const models = id ? (await host.connectionModels(id).catch(() => ({ models: [] }))).models : []
    return c.json({ options: models.map((value) => ({ value, label: value })) })
  })
}
export function registerRoutes(app: Hono, storage: ExtensionStorage, t: Translate, deviceRoutes = false) {
  const bridge = new Bridge(storage)
  // 宿主会覆盖子路由 onError，因此在处理函数内捕获协议错误。
  const guard = (handler: (c: Context) => Promise<Response>) => async (c: Context) => {
    try {
      return await handler(c)
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        (error instanceof Error && ['INVALID_INPUT', 'PAYLOAD_TOO_LARGE'].includes(error.message))
      )
        return c.json({ code: 'INVALID_INPUT', message: t('请求无效') }, 400)
      throw error
    }
  }
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  if (!deviceRoutes) {
    app.post('/pair', (c) => c.json(bridge.pair()))
    app.post('/revoke', (c) => {
      bridge.revoke()
      return c.json({ ok: true })
    })
    app.get('/status', (c) => c.json(bridge.status()))
    app.get('/addresses', (c) => c.json({ addresses: localAddresses() }))
    app.post(
      '/commands',
      guard(async (c) => {
        const command = parseCommand(await body(c))
        try {
          return c.json({ id: bridge.enqueue(command) }, 202)
        } catch {
          return c.json({ code: 'DEVICE_UNAVAILABLE', message: t('手机未就绪或正在执行指令') }, 409)
        }
      }),
    )
    app.get('/commands/:id', (c) => {
      try {
        return c.json({ result: bridge.result(c.req.param('id')) })
      } catch {
        return c.json({ code: 'OUTCOME_UNKNOWN', message: t('指令已结束或结果未知，请重新观察屏幕') }, 409)
      }
    })
    app.post('/cancel', (c) => {
      bridge.cancel()
      return c.json({ ok: true, message: t('已取消未交付指令，已交付操作可能仍会完成') })
    })
    return
  }
  app.use('*', async (c, next) => {
    const token = c.req.header('Authorization') ?? ''
    const id = c.req.header('X-Device-Id') ?? ''
    if (!token.startsWith('Bearer ') || !bridge.authenticate(id, token.slice(7)))
      return c.json({ code: 'UNAUTHORIZED' }, 401)
    await next()
  })
  app.post(
    '/poll',
    guard(async (c) => {
      const v = await body(c, 200_000)
      if (v.protocol !== 1 || typeof v.ready !== 'boolean') return c.json({ code: 'PROTOCOL_MISMATCH' }, 400)
      return c.json({
        protocol: 1,
        job: bridge.poll(
          c.req.header('X-Device-Id') ?? '',
          v.ready,
          parseResumed(v.resumed),
          parseNotifications(v.notifications),
        ),
      })
    }),
  )
  app.post(
    '/result',
    guard(async (c) => {
      const v = await body(c, 3_000_000)
      if (typeof v.id !== 'string') return c.json({ code: 'INVALID_INPUT' }, 400)
      const accepted = bridge.finish(c.req.header('X-Device-Id') ?? '', v.id, parseResult(v.result))
      return c.json({ accepted }, accepted ? 200 : 409)
    }),
  )
}
