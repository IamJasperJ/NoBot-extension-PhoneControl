import { afterEach, expect, test } from 'bun:test'
import { Hono } from '../../apps/server/node_modules/hono'
import type { ExtensionContext } from '../../apps/server/src/extensions/types'
import { Bridge } from './bridge'
import { generatePlan, type RoutinePlan, routineOf, runRoutine, startBackground } from './life'
import { notificationPrompt, quietNow, reactNotifications, relevant } from './notifications'
import type { Report } from './operator'
import {
  localTime,
  parseJSON,
  profileOf,
  profilePrompt,
  recordUsage,
  refreshApps,
  shouldShare,
  updateNotes,
  writeDiary,
} from './profile'
import { type PhoneNotification, parseNotifications } from './protocol'
import { type LifeResponse, registerRoutes, registerTaskRoutes } from './routes'
import { didSomething, reservePhone, settingsOf, startTask, stopAll, timing } from './tasks'

const NOW = Date.parse('2026-11-07T12:00:00+08:00')
const signal = new AbortController().signal
const notification = (at = NOW): PhoneNotification => ({
  at,
  package: 'com.chat.app',
  app: 'Chat',
  title: 'Friend',
  text: 'Hello',
})
const report: Report = {
  goal: 'Read',
  endReason: 'done',
  summary: 'Read the feed',
  memories: [],
  steps: [{ index: 1, thought: '', action: 'open_app "Feed"', result: 'OK', at: 0 }],
  durationMs: 100,
}
function context(raw: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>()
  const calls = {
    quiet: [] as string[],
    complete: [] as unknown[],
    triggers: [] as string[],
    starts: [] as unknown[],
    waits: 0,
  }
  let answer = '{}',
    fail = false,
    generating = false
  const ctx: ExtensionContext = {
    chatId: 'chat',
    settings: { chatId: 'chat', ...raw },
    storage: {
      get: <T>(k: string) => map.get(k) as T | undefined,
      set: (k, v) => {
        map.set(k, structuredClone(v))
      },
      delete: (k) => {
        map.delete(k)
      },
    },
    host: {
      quietPrompt: async (opts: Parameters<ExtensionContext['host']['quietPrompt']>[0]) => {
        expect(opts.signal).toBeDefined()
        calls.quiet.push(opts.instruction)
        if (fail) throw Error('test')
        return answer
      },
      complete: async (opts: Parameters<ExtensionContext['host']['complete']>[0]) => {
        expect(opts.signal).toBeDefined()
        calls.complete.push(opts)
        if (fail) throw Error('test')
        return answer
      },
      isGenerating: () => generating,
      waitIdle: async () => {
        calls.waits++
      },
      trigger: (_id: string, opts: Parameters<ExtensionContext['host']['trigger']>[1]) => {
        calls.triggers.push(opts?.instruction ?? '')
      },
    } as unknown as ExtensionContext['host'],
  }
  timing.now = () => NOW
  const bridge = new Bridge(ctx.storage, timing.now)
  const pair = bridge.pair()
  bridge.poll(pair.deviceId, true)
  const start: typeof startTask = async (_ctx, input) => {
    calls.starts.push(input)
    return report
  }
  return {
    ctx,
    calls,
    bridge,
    pair,
    start,
    answer: (text: string) => {
      answer = text
    },
    fail: () => {
      fail = true
    },
    generating: () => {
      generating = true
    },
  }
}
afterEach(() => {
  timing.now = Date.now
  timing.random = Math.random
  stopAll()
})

test('通知解析兼容旧版本，错误容器拒绝，条目类型丢弃并截断', () => {
  expect(parseNotifications(undefined)).toEqual([])
  for (const value of [null, {}, 'text', true]) expect(() => parseNotifications(value)).toThrow('INVALID_INPUT')
  expect(
    parseNotifications([
      null,
      {},
      { ...notification(), at: NaN },
      { ...notification(), at: 1e300 },
      { ...notification(), text: 3 },
    ]),
  ).toEqual([])
  const result = parseNotifications(
    Array.from({ length: 25 }, () => ({
      ...notification(),
      package: 'p'.repeat(300),
      app: 'a'.repeat(200),
      title: 't'.repeat(300),
      text: 'x'.repeat(2000),
    })),
  )
  expect(result).toHaveLength(20)
  expect(result[0]?.package).toHaveLength(200)
  expect(result[0]?.app).toHaveLength(100)
  expect(result[0]?.title).toHaveLength(200)
  expect(result[0]?.text).toHaveLength(1000)
  expect(parseNotifications([{ ...notification(), text: '' }])).toHaveLength(1)
})

test('轮询去重、三天清理、100 条上限和新通知回调', () => {
  const { ctx, bridge, pair } = context()
  bridge.poll(pair.deviceId, true, undefined, [notification(), notification(), notification(NOW - 4 * 86400_000)])
  bridge.poll(pair.deviceId, true, undefined, [notification()])
  expect(ctx.storage.get<PhoneNotification[]>('notifications')).toHaveLength(1)
  expect(ctx.storage.get<{ items: PhoneNotification[] }>('notificationPending')?.items).toHaveLength(1)
  bridge.poll(
    pair.deviceId,
    true,
    undefined,
    Array.from({ length: 110 }, (_, i) => notification(NOW + i + 1)),
  )
  expect(ctx.storage.get<PhoneNotification[]>('notifications')).toHaveLength(100)
})

test('应用筛选、六小时注入、关闭通知和跨午夜安静时间', () => {
  const { ctx } = context()
  const s = settingsOf({ notifyApps: 'Chat', notifyIgnore: 'Other', quietHours: '23:30-07:30' })
  expect(relevant([notification(), { ...notification(), app: 'Other' }], s)).toHaveLength(1)
  expect(quietNow(s, Date.parse('2026-11-07T23:40+08:00'))).toBe(true)
  expect(quietNow(s, Date.parse('2026-11-07T07:29+08:00'))).toBe(true)
  expect(quietNow(s, Date.parse('2026-11-07T07:30+08:00'))).toBe(false)
  expect(quietNow(settingsOf({ quietHours: '11:00-13:00' }), NOW)).toBe(true)
  expect(quietNow(settingsOf({ quietHours: 'invalid' }), NOW)).toBe(false)
  ctx.storage.set('notifications', [
    notification(NOW - 7 * 3600_000),
    ...Array.from({ length: 10 }, (_, i) => ({ ...notification(), text: `text-${i}` })),
  ])
  const prompt = notificationPrompt(ctx.storage, s, NOW)
  expect(prompt).toContain('untrusted')
  expect(prompt).not.toContain('text-1"')
  expect(prompt).toContain('text-9')
  expect(notificationPrompt(ctx.storage, settingsOf({ notifyMode: 'off' }), NOW)).toBe('')
})

function pending(ctx: ExtensionContext, at = NOW - 45_000) {
  ctx.storage.set('notificationPending', { at, items: [notification()] })
}
test('通知防抖在最后一条后 45 秒；三种决策、无效 JSON 与错误', async () => {
  for (const action of ['ignore', 'mention', 'check', 'bad']) {
    const t = context()
    t.answer(action === 'bad' ? 'broken' : JSON.stringify({ action, goal: 'Read the message' }))
    pending(t.ctx, NOW - 44_999)
    await reactNotifications(t.ctx, signal, NOW, t.start)
    expect(t.calls.quiet).toHaveLength(0)
    pending(t.ctx)
    await reactNotifications(t.ctx, signal, NOW, t.start)
    expect(t.calls.quiet).toHaveLength(1)
    expect(t.calls.triggers).toHaveLength(action === 'mention' ? 1 : 0)
    expect(t.calls.starts).toHaveLength(action === 'check' ? 1 : 0)
    if (action === 'check')
      expect(t.calls.starts[0]).toMatchObject({ mode: 'background', source: 'notification', tracked: true, signal })
    if (action === 'mention') {
      expect(t.calls.waits).toBe(1)
      expect(t.calls.triggers[0]).toContain('untrusted')
    }
  }
  const t = context()
  pending(t.ctx)
  t.fail()
  await reactNotifications(t.ctx, signal, NOW, t.start)
  expect(t.calls.triggers).toHaveLength(0)
})

test('通知合并后重新防抖；安静时段、关闭和仅上下文不反应', async () => {
  const t = context()
  pending(t.ctx, NOW - 40_000)
  t.bridge.poll(t.pair.deviceId, true, undefined, [notification(NOW + 1)])
  expect(t.ctx.storage.get<{ at: number; items: unknown[] }>('notificationPending')).toMatchObject({ at: NOW })
  await reactNotifications(t.ctx, signal, NOW + 44_999, t.start)
  expect(t.calls.quiet).toHaveLength(0)
  for (const settings of [{ quietHours: '11:00-13:00' }, { notifyMode: 'off' }, { notifyMode: 'context' }]) {
    const t = context(settings)
    pending(t.ctx)
    await reactNotifications(t.ctx, signal, NOW, t.start)
    expect(t.calls.quiet).toHaveLength(0)
    expect(t.ctx.storage.get('notificationPending')).toBeUndefined()
  }
})

test('通知频率限制每十分钟一次、每天二十次、隔日恢复；生成中或设备占用延后', async () => {
  for (const rate of [
    { date: '2026-11-07', count: 1, last: NOW - 599999 },
    { date: '2026-11-07', count: 20, last: NOW - 700000 },
  ]) {
    const t = context()
    pending(t.ctx)
    t.ctx.storage.set('notificationRate', rate)
    await reactNotifications(t.ctx, signal, NOW, t.start)
    expect(t.calls.quiet).toHaveLength(0)
    // 冷却中的通知留着等冷却结束；当天次数用完的直接丢掉
    expect(!!t.ctx.storage.get('notificationPending')).toBe(rate.count < 20)
  }
  const cooling = context()
  cooling.answer('{"action":"mention"}')
  pending(cooling.ctx)
  cooling.ctx.storage.set('notificationRate', { date: '2026-11-07', count: 1, last: NOW - 300_000 })
  await reactNotifications(cooling.ctx, signal, NOW, cooling.start)
  expect(cooling.calls.quiet).toHaveLength(0)
  await reactNotifications(cooling.ctx, signal, NOW + 300_000, cooling.start)
  expect(cooling.calls.triggers).toHaveLength(1)
  const t = context()
  t.answer('{"action":"mention"}')
  pending(t.ctx)
  t.ctx.storage.set('notificationRate', { date: '2026-11-06', count: 20, last: NOW - 86400_000 })
  await reactNotifications(t.ctx, signal, NOW, t.start)
  expect(t.calls.triggers).toHaveLength(1)
  expect(t.ctx.storage.get('notificationRate')).toMatchObject({ count: 1, date: '2026-11-07' })
  const busy = context()
  pending(busy.ctx)
  const release = reservePhone(busy.ctx.storage)
  await reactNotifications(busy.ctx, signal, NOW, busy.start)
  expect(busy.calls.quiet).toHaveLength(0)
  release?.()
  busy.generating()
  await reactNotifications(busy.ctx, signal, NOW, busy.start)
  expect(busy.calls.quiet).toHaveLength(0)
})

test('档案刷新仅在线就绪且空闲、过期时执行，失败不更新，刷新期间拒绝任务', async () => {
  const t = context()
  let calls = 0
  const success = async () => {
    calls++
    expect(() => startTask(t.ctx, { chatId: 'chat', goal: 'Read', mode: 'wait', minutes: 1 })).toThrow('PHONE_BUSY')
    return { ok: true, code: 'OK', data: { apps: [{ label: 'Chat', packageName: 'com.chat.app' }] } }
  }
  await refreshApps(t.ctx, signal, NOW, success)
  expect(calls).toBe(1)
  expect(profileOf(t.ctx.storage).appsAt).toBe(NOW)
  await refreshApps(t.ctx, signal, NOW, success)
  expect(calls).toBe(1)
  const release = reservePhone(t.ctx.storage)
  await refreshApps(t.ctx, signal, NOW + 86400_000, success)
  release?.()
  expect(calls).toBe(1)
  t.bridge.poll(t.pair.deviceId, false)
  await refreshApps(t.ctx, signal, NOW, success)
  expect(calls).toBe(1)
  const fail = context()
  await refreshApps(fail.ctx, signal, NOW, async () => {
    throw Error('offline')
  })
  expect(profileOf(fail.ctx.storage).appsAt).toBe(0)
})

test('使用统计、notes 更新去重、失败和无效响应保留，连接模型与 signal 传递', async () => {
  const t = context({ operatorConnectionId: 'connection', operatorModel: 'model' })
  recordUsage(t.ctx.storage, 'com.chat.app', NOW)
  recordUsage(t.ctx.storage, 'com.chat.app', NOW)
  expect(profileOf(t.ctx.storage).usage['com.chat.app']).toBe(2)
  t.answer('["Account A","Account A"]')
  await updateNotes(t.ctx, 'report', signal, () => 'en')
  expect(profileOf(t.ctx.storage).notes).toEqual(['Account A'])
  expect(t.calls.complete[0]).toMatchObject({ connectionId: 'connection', model: 'model', signal })
  t.answer('[3]')
  await updateNotes(t.ctx, 'report', signal, () => 'en')
  expect(profileOf(t.ctx.storage).notes).toEqual(['Account A'])
  t.fail()
  await updateNotes(t.ctx, 'report', signal, () => 'en')
  expect(profileOf(t.ctx.storage).notes).toEqual(['Account A'])
})

test('日记按时区当天活动生成、每日幂等、最多三十天且只注入最近三天', async () => {
  const t = context()
  t.answer('My phone diary')
  await writeDiary(t.ctx, signal, NOW)
  expect(t.calls.quiet).toHaveLength(0)
  t.ctx.storage.set('notifications', [notification()])
  t.ctx.storage.set(
    'diary',
    Array.from({ length: 31 }, (_, i) => ({
      date: new Date(Date.parse('2026-11-06') - i * 86400_000).toISOString().slice(0, 10),
      text: `day-${i}`,
    })),
  )
  await writeDiary(t.ctx, signal, NOW)
  await writeDiary(t.ctx, signal, NOW)
  expect(t.calls.quiet).toHaveLength(1)
  expect(t.ctx.storage.get<unknown[]>('diary')).toHaveLength(30)
  const prompt = profilePrompt(t.ctx.storage, NOW, 'Asia/Shanghai')
  expect(prompt).toContain('day-0')
  expect(prompt).not.toContain('day-2"')
  expect(localTime(Date.parse('2026-11-06T17:00:00Z'), 'Asia/Shanghai').date).toBe('2026-11-07')
})

test('作息跨午夜计划、跳过概率、随机时刻、日期变更继承未结束时段', () => {
  const s = settingsOf({ routineWindows: '23:30-01:30', routineSkip: 0 })
  const morning = Date.parse('2026-11-07T00:00:00+08:00')
  const plan = generatePlan(s, morning, () => 0.5)
  expect(plan.windows[0]).toMatchObject({
    at: Date.parse('2026-11-08T00:25:00+08:00'),
    end: Date.parse('2026-11-08T01:30:00+08:00'),
    status: 'pending',
  })
  expect(generatePlan({ ...s, routineSkip: 1 }, morning, () => 0.5).windows[0]?.status).toBe('skipped')
  // 随机数取到最大时也离时段结束至少 10 分钟；短时段留一半
  expect(generatePlan(s, morning, () => 0.999999).windows[0]?.at).toBeLessThanOrEqual(
    Date.parse('2026-11-08T01:20:00+08:00'),
  )
  const short = generatePlan({ ...s, routineWindows: '12:00-12:04' }, morning, () => 0.999999).windows[0]
  expect(short && short.end - short.at).toBeGreaterThanOrEqual(120_000)
  expect(generatePlan(s, Date.parse('2026-11-08T00:00:00+08:00'), () => 0.5, plan).windows).toHaveLength(2)
})

test('当天改了作息设置会按新时段重排，已用次数保留', () => {
  const t = context({ routineWindows: '13:00-14:00', routineSkip: 0 })
  const first = routineOf(t.ctx, NOW, () => 0.5)
  expect(first.windows.map((w) => w.window)).toEqual(['13:00-14:00'])
  t.ctx.storage.set('routinePlan', { ...first, todayCount: 2 })
  expect(routineOf(t.ctx, NOW + 60_000, () => 0.1)).toMatchObject({ todayCount: 2 })
  t.ctx.settings = { ...t.ctx.settings, routineWindows: '15:00-16:00' }
  const changed = routineOf(t.ctx, NOW + 120_000, () => 0.5)
  expect(changed.windows.map((w) => w.window)).toEqual(['15:00-16:00'])
  expect(changed.todayCount).toBe(2)
})

test('旧版本存的计划（没有 key）也按当前设置重排，没变的时段保留状态', () => {
  const t = context({ routineWindows: '11:00-13:00\n15:00-16:00', routineSkip: 0 })
  const kept = { window: '11:00-13:00', at: NOW - 1000, end: NOW + 3600_000, status: 'used' as const }
  t.ctx.storage.set('routinePlan', {
    date: '2026-11-07',
    todayCount: 1,
    windows: [kept, { window: '08:30-09:30', at: NOW - 9e6, end: NOW - 8e6, status: 'missed' }],
  })
  const plan = routineOf(t.ctx, NOW, () => 0.5)
  expect(plan.windows.map((w) => w.window)).toEqual(['11:00-13:00', '15:00-16:00'])
  expect(plan.windows[0]).toEqual(kept)
  expect(plan.windows[1]?.status).toBe('pending')
  expect(plan.todayCount).toBe(1)
  expect(routineOf(t.ctx, NOW + 1000, () => 0.1)).toEqual(plan)
})

test('作息每天上限、错过时段不补、拒绝和主动任务来源', async () => {
  for (const use of [false, true]) {
    const t = context({ routine: true, routinePerDay: 1, routineWindows: '11:00-13:00' })
    t.answer(JSON.stringify({ use, goal: 'Read cats' }))
    const plan: RoutinePlan = {
      date: '2026-11-07',
      todayCount: 0,
      windows: [{ window: '11:00-13:00', at: NOW - 1000, end: NOW + 3600_000, status: 'pending' }],
    }
    t.ctx.storage.set('routinePlan', plan)
    await runRoutine(t.ctx, signal, NOW, () => 0, t.start)
    expect(t.calls.starts).toHaveLength(use ? 1 : 0)
    if (use) expect(t.calls.starts[0]).toMatchObject({ source: 'routine', mode: 'background', tracked: true })
    expect(t.ctx.storage.get<RoutinePlan>('routinePlan')?.todayCount).toBe(use ? 1 : 0)
    await runRoutine(t.ctx, signal, NOW, () => 0, t.start)
    expect(t.calls.quiet).toHaveLength(1)
  }
  const t = context({ routine: true, routinePerDay: 0, routineWindows: '11:00-11:59' })
  t.ctx.storage.set('routinePlan', {
    date: '2026-11-07',
    todayCount: 0,
    windows: [{ window: '11:00-11:59', at: NOW - 5000, end: NOW - 1, status: 'pending' }],
  })
  await runRoutine(t.ctx, signal, NOW, () => 0, t.start)
  expect(t.calls.quiet).toHaveLength(0)
  expect(t.ctx.storage.get<RoutinePlan>('routinePlan')?.windows[0]?.status).toBe('missed')
})

test('没做成的自动任务不分享，模型回答前后带话也能解析', async () => {
  const t = context({ routineShare: 'always' })
  const empty = { ...report, endReason: 'gave_up' as const, steps: [] }
  expect(await shouldShare(t.ctx, 'routine', empty, signal)).toBe(false)
  expect(await shouldShare(t.ctx, 'notification', empty, signal)).toBe(false)
  expect(await shouldShare(t.ctx, undefined, empty, signal)).toBe(true)
  // 只有一步「放弃」也算没做成
  const quit = { ...empty, steps: [{ index: 1, thought: '', action: 'give_up: 没装这个应用', result: 'OK', at: 0 }] }
  expect(didSomething(quit)).toBe(false)
  expect(await shouldShare(t.ctx, 'routine', quit, signal)).toBe(false)
  expect(didSomething(report)).toBe(true)
  expect(parseJSON('好的。{"share":true} 就这样')).toEqual({ share: true })
  expect(parseJSON('笔记如下：["a","b"]')).toEqual(['a', 'b'])
  expect(parseJSON('随便聊聊')).toBeNull()
})

test('作息分享三种模式，只在 worth 使用角色静默判断，停止不分享', async () => {
  for (const mode of ['always', 'never', 'worth']) {
    const t = context({ routineShare: mode })
    t.answer('{"share":true}')
    expect(await shouldShare(t.ctx, 'routine', report, signal)).toBe(mode !== 'never')
    expect(t.calls.quiet).toHaveLength(mode === 'worth' ? 1 : 0)
    expect(await shouldShare(t.ctx, 'routine', { ...report, endReason: 'stopped' }, signal)).toBe(false)
    expect(await shouldShare(t.ctx, undefined, report, signal)).toBe(true)
  }
  const t = context()
  t.answer('{"share":false}')
  expect(await shouldShare(t.ctx, 'routine', report, signal)).toBe(false)
  t.answer('bad')
  expect(await shouldShare(t.ctx, 'routine', report, signal)).toBe(false)
})

test('管理接口返回明确结构、校验笔记和清除通知；公开轮询错误数组返回 400', async () => {
  const t = context()
  const app = new Hono()
  registerTaskRoutes(app, t.ctx, (k) => k)
  const response = await app.request('/life')
  expect(response.headers.get('cache-control')).toBe('no-store')
  const life = (await response.json()) as LifeResponse
  expect(life.profile.notes).toEqual([])
  expect(life.routine.todayCount).toBe(0)
  const post = (notes: unknown) =>
    app.request('/profile/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
  expect((await post(['note'])).status).toBe(200)
  for (const notes of [[3], ['x'.repeat(121)], Array(41).fill('a')]) expect((await post(notes)).status).toBe(400)
  pending(t.ctx)
  expect((await app.request('/notifications/clear', { method: 'POST' })).status).toBe(200)
  expect(t.ctx.storage.get('notificationPending')).toBeUndefined()
  const publicApp = new Hono()
  registerRoutes(publicApp, t.ctx.storage, (k) => k, true)
  const invalid = await publicApp.request('/poll', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.pair.token}`, 'X-Device-Id': t.pair.deviceId },
    body: JSON.stringify({ protocol: 1, ready: true, notifications: {} }),
  })
  expect(invalid.status).toBe(400)
})

test('注册宿主日计划和 skip 周期任务，调度设置变更同步日记计划', async () => {
  const t = context()
  const jobs = new Map<string, { definition: unknown; run: (s: AbortSignal) => void | Promise<void> }>()
  startBackground(
    {
      ...t.ctx,
      tasks: {
        register: (definition, run) => {
          jobs.set(definition.id, { definition, run })
        },
      },
    },
    signal,
  )
  expect(jobs.get('phone-diary')?.definition).toMatchObject({
    schedule: { kind: 'daily', time: '23:30', timeZone: 'Asia/Shanghai' },
  })
  expect(jobs.get('phone-life')?.definition).toMatchObject({ schedule: { everyMs: 300000 }, misfire: 'skip' })
  t.ctx.settings.diaryTime = '22:00'
  t.bridge.poll(t.pair.deviceId, false)
  await jobs.get('phone-life')?.run(signal)
  expect(jobs.get('phone-diary')?.definition).toMatchObject({ schedule: { time: '22:00' } })
  expect(settingsOf({ timeZone: 'invalid' }).timeZone).toBe('Asia/Shanghai')
})

test('安静时段收到的通知在时段结束后也只记录；断线仍可自然提一句', async () => {
  const t = context({ quietHours: '11:00-12:00' })
  t.answer('{"action":"mention"}')
  t.ctx.storage.set('notificationPending', { at: NOW - 45_000, items: [notification(NOW - 60_000)] })
  await reactNotifications(t.ctx, signal, NOW, t.start)
  expect(t.calls.quiet).toHaveLength(0)
  const offline = context()
  offline.answer('{"action":"mention"}')
  offline.bridge.revoke()
  pending(offline.ctx)
  await reactNotifications(offline.ctx, signal, NOW, offline.start)
  expect(offline.calls.triggers).toHaveLength(1)
})

test('日记和笔记提炼失败或取消不覆盖旧值；笔记异步提炼不能覆盖主人编辑', async () => {
  const t = context()
  t.ctx.storage.set('notifications', [notification()])
  t.ctx.storage.set('profile', { ...profileOf(t.ctx.storage), notes: ['old'] })
  t.fail()
  await writeDiary(t.ctx, signal, NOW)
  expect(t.ctx.storage.get('diary')).toBeUndefined()
  const c = new AbortController()
  c.abort()
  await writeDiary(t.ctx, c.signal, NOW)
  expect(t.calls.quiet).toHaveLength(1)
  t.ctx.host.complete = async () => {
    t.ctx.storage.set('profile', { ...profileOf(t.ctx.storage), notes: ['owner edit'] })
    return '["model edit"]'
  }
  await updateNotes(t.ctx, 'report', signal, () => 'en')
  expect(profileOf(t.ctx.storage).notes).toEqual(['owner edit'])
})

test('作息设备离线、会话生成、关闭开关时不决策；新一天重置次数', async () => {
  for (const mode of ['offline', 'generating', 'disabled']) {
    const t = context({ routine: mode !== 'disabled' })
    if (mode === 'offline') t.bridge.revoke()
    if (mode === 'generating') t.generating()
    t.ctx.storage.set('routinePlan', {
      date: '2026-11-07',
      todayCount: 0,
      windows: [{ window: '11:00-13:00', at: NOW - 1, end: NOW + 1000, status: 'pending' }],
    })
    await runRoutine(t.ctx, signal, NOW, () => 0, t.start)
    expect(t.calls.quiet).toHaveLength(0)
  }
  const t = context({ routine: true })
  t.ctx.storage.set('routinePlan', { date: '2026-11-06', todayCount: 4, windows: [] })
  await runRoutine(t.ctx, signal, NOW, () => 0, t.start)
  expect(t.ctx.storage.get<RoutinePlan>('routinePlan')?.todayCount).toBe(0)
})
