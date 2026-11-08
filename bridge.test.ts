import { describe, expect, test } from 'bun:test'
import { Hono } from '../../apps/server/node_modules/hono'
import type { ExtensionStorage } from '../../apps/server/src/extensions/types'
import { Bridge, parseResumed } from './bridge'
import { runCommand } from './commands'
import { parseCommand, parseResult } from './protocol'
import { isPrivateIpv4, localAddresses, registerRoutes } from './routes'
import { timing } from './tasks'

function memory(): ExtensionStorage {
  const values = new Map<string, unknown>()
  return {
    get<T>(key: string) {
      return structuredClone(values.get(key)) as T | undefined
    },
    set(key, value) {
      values.set(key, structuredClone(value))
    },
    delete(key) {
      values.delete(key)
    },
  }
}
function setup() {
  const storage = memory()
  let now = 1000
  const bridge = new Bridge(storage, () => now)
  const pair = bridge.pair()
  bridge.poll(pair.deviceId, true)
  return {
    storage,
    bridge,
    pair,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('设备指令状态机', () => {
  test('同轮指令携带相同任务标识，下一轮和直接指令使用独立标识', () => {
    const { bridge, pair } = setup()
    for (const taskId of ['task-1', 'task-1', 'task-2', undefined]) {
      const id = bridge.enqueue({ action: 'observe' }, taskId)
      const job = bridge.poll(pair.deviceId, true)
      expect(job?.taskId).toBe(taskId ?? id)
      bridge.finish(pair.deviceId, id, { ok: true, code: 'OK' })
      bridge.clear(id)
    }
  })
  test('令牌只存摘要，按用户隔离，重新配对撤销旧授权', () => {
    const { bridge, pair, storage } = setup()
    expect(JSON.stringify(storage.get('device'))).not.toContain(pair.token)
    expect(bridge.authenticate(pair.deviceId, pair.token)).toBe(true)
    expect(new Bridge(memory()).authenticate(pair.deviceId, pair.token)).toBe(false)
    expect(bridge.authenticate(pair.deviceId, '0'.repeat(64))).toBe(false)
    const next = bridge.pair()
    expect(bridge.authenticate(pair.deviceId, pair.token)).toBe(false)
    expect(bridge.authenticate(next.deviceId, next.token)).toBe(true)
  })
  test('未就绪与离线设备不可执行', () => {
    const { bridge, pair, advance } = setup()
    bridge.poll(pair.deviceId, false)
    expect(() => bridge.enqueue({ action: 'home' })).toThrow('DEVICE_OFFLINE')
    bridge.poll(pair.deviceId, true)
    advance(50000)
    expect(() => bridge.enqueue({ action: 'home' })).toThrow('DEVICE_OFFLINE')
  })
  test('串行交付，重复轮询及服务端重建不重发', () => {
    const { bridge, pair, storage } = setup()
    const id = bridge.enqueue({ action: 'tap', x: 0.2, y: 0.3 })
    expect(() => bridge.enqueue({ action: 'home' })).toThrow('DEVICE_BUSY')
    expect(bridge.poll(pair.deviceId, true)?.id).toBe(id)
    expect(bridge.poll(pair.deviceId, true)).toBeNull()
    expect(new Bridge(storage, () => 1000).poll(pair.deviceId, true)).toBeNull()
    expect(bridge.finish(pair.deviceId, id, { ok: true, code: 'OK' })).toBe(true)
    expect(bridge.finish(pair.deviceId, id, { ok: false, code: 'FAILED' })).toBe(true)
    expect(bridge.result(id)).toEqual({ ok: true, code: 'OK' })
  })
  test('拒绝未交付、其他设备和错误指令的回报', () => {
    const { bridge, pair } = setup()
    const id = bridge.enqueue({ action: 'observe' })
    const result = { ok: true, code: 'OK' }
    expect(bridge.finish(pair.deviceId, id, result)).toBe(false)
    bridge.poll(pair.deviceId, true)
    expect(bridge.finish('wrong', id, result)).toBe(false)
    expect(bridge.finish(pair.deviceId, 'wrong', result)).toBe(false)
  })
  test('超时结果未知，迟到回报不污染新指令', () => {
    const { bridge, pair, advance } = setup()
    const id = bridge.enqueue({ action: 'home' })
    bridge.poll(pair.deviceId, true)
    advance(26000)
    expect(() => bridge.result(id)).toThrow('OUTCOME_UNKNOWN')
    bridge.poll(pair.deviceId, true)
    const next = bridge.enqueue({ action: 'observe' })
    expect(bridge.finish(pair.deviceId, id, { ok: true, code: 'OK' })).toBe(false)
    expect(bridge.result(next)).toBeNull()
  })
  test('取消排队指令，已交付指令继续持有租约', () => {
    const { bridge, pair } = setup()
    const id = bridge.enqueue({ action: 'home' })
    bridge.cancel(id)
    expect(bridge.poll(pair.deviceId, true)).toBeNull()
    expect(() => bridge.result(id)).toThrow('CANCELLED')
    const second = bridge.enqueue({ action: 'home' })
    bridge.poll(pair.deviceId, true)
    bridge.cancel(second)
    expect(() => bridge.enqueue({ action: 'home' })).toThrow('DEVICE_BUSY')
    bridge.revoke()
    expect(bridge.authenticate(pair.deviceId, pair.token)).toBe(false)
    expect(() => bridge.result(second)).toThrow('CANCELLED')
  })
})

describe('断线记录', () => {
  test('短间隔和恰好 30 秒不记录，超过 30 秒记录服务端间隔', () => {
    const { bridge, pair, storage, advance } = setup()
    advance(100)
    bridge.poll(pair.deviceId, true)
    advance(30_000)
    bridge.poll(pair.deviceId, true)
    expect(bridge.disconnects()).toEqual([])
    advance(30_001)
    bridge.poll(pair.deviceId, false)
    const records = [{ at: 61_101, gapMs: 30_001, cause: 'unknown' as const }]
    expect(bridge.disconnects()).toEqual(records)
    expect(new Bridge(storage).disconnects()).toEqual(records)
  })

  test('短间隔也记录 App 原因、估计时长和截断后的错误，长间隔不重复记录', () => {
    const { bridge, pair, advance } = setup()
    advance(100)
    bridge.poll(pair.deviceId, true, parseResumed({ offlineMs: 123456, cause: 'network', error: 'x'.repeat(201) }))
    expect(bridge.disconnects()).toEqual([
      { at: 1100, gapMs: 100, cause: 'network', appOfflineMs: 123456, error: 'x'.repeat(200) },
    ])
    advance(30_001)
    bridge.poll(pair.deviceId, false, parseResumed({ offlineMs: 30_000, cause: 'paused' }))
    expect(bridge.disconnects()).toHaveLength(2)
    expect(bridge.disconnects()[1]).toMatchObject({ cause: 'paused', appOfflineMs: 30_000, gapMs: 30_001 })
  })

  test('首次轮询不记录，除非 App 主动报告恢复', () => {
    const bridge = new Bridge(memory(), () => 100_000)
    const pair = bridge.pair()
    bridge.poll(pair.deviceId, true)
    expect(bridge.disconnects()).toEqual([])
    const next = bridge.pair()
    bridge.poll(next.deviceId, true, parseResumed({ offlineMs: 42, cause: 'restarted' }))
    expect(bridge.disconnects()).toEqual([{ at: 100_000, gapMs: 100_000, cause: 'restarted', appOfflineMs: 42 }])
  })

  test('存储只保留最近 30 条，状态返回最近 10 条且最新在前', () => {
    const { bridge, pair, advance } = setup()
    for (let i = 0; i < 35; i++) {
      advance(30_001)
      bridge.poll(pair.deviceId, true)
    }
    const records = bridge.disconnects()
    expect(records).toHaveLength(30)
    expect(records[0]?.at).toBe(1000 + 6 * 30_001)
    expect(records[29]?.at).toBe(1000 + 35 * 30_001)
    expect(bridge.status().disconnects).toEqual(records.slice(-10).reverse())
    expect(bridge.disconnects()).toEqual(records)
  })

  test('重新配对和撤销会清空记录', () => {
    const { bridge, pair, storage, advance } = setup()
    advance(30_001)
    bridge.poll(pair.deviceId, true)
    expect(bridge.disconnects()).toHaveLength(1)
    const next = bridge.pair()
    expect(bridge.disconnects()).toEqual([])
    expect(bridge.status().disconnects).toEqual([])
    expect(storage.get('disconnects')).toBeUndefined()
    bridge.poll(next.deviceId, true, parseResumed({ offlineMs: 0, cause: 'frozen' }))
    expect(bridge.disconnects()).toHaveLength(1)
    bridge.revoke()
    expect(bridge.disconnects()).toEqual([])
    expect(bridge.status().disconnects).toEqual([])
    expect(storage.get('disconnects')).toBeUndefined()
  })

  test('恢复信息接受缺省、全部原因和时长边界，拒绝非法字段', () => {
    expect(parseResumed(undefined)).toBeUndefined()
    for (const cause of ['frozen', 'network', 'restarted', 'paused'] as const) {
      for (const offlineMs of [0, 604_800_000]) expect(parseResumed({ offlineMs, cause })).toEqual({ offlineMs, cause })
    }
    expect(parseResumed({ offlineMs: 0, cause: 'frozen', error: '' })?.error).toBe('')
    for (const value of [null, [], 'bad', 1, true, {}, { cause: 'frozen' }, { offlineMs: 0 }])
      expect(() => parseResumed(value)).toThrow('INVALID_INPUT')
    for (const offlineMs of [-1, 604_800_001, 0.5, NaN, Infinity, -Infinity, '0', null, undefined])
      expect(() => parseResumed({ offlineMs, cause: 'frozen' })).toThrow('INVALID_INPUT')
    for (const cause of ['unknown', 'FROZEN', '', 0, null, [], {}])
      expect(() => parseResumed({ offlineMs: 0, cause })).toThrow('INVALID_INPUT')
    for (const error of [null, 0, false, [], {}])
      expect(() => parseResumed({ offlineMs: 0, cause: 'frozen', error })).toThrow('INVALID_INPUT')
  })
})

describe('协议验证', () => {
  test('坐标、动作、输入长度和截图格式验证', () => {
    expect(parseCommand({ action: 'swipe', x: 0, y: 1, endX: 1, endY: 0 })).toMatchObject({ duration: 500 })
    expect(parseCommand({ action: 'type', text: '你好😊' })).toEqual({ action: 'type', text: '你好😊' })
    for (const value of [
      null,
      [],
      { action: 'shell' },
      { action: 'tap', x: NaN, y: 1 },
      { action: 'tap', x: 2, y: 1 },
      { action: 'open', packageName: 'a;rm' },
      { action: 'type', text: 'a'.repeat(2001) },
    ])
      expect(() => parseCommand(value)).toThrow()
    for (const value of [
      { ok: 'yes', code: 'OK' },
      { ok: true, code: 'OK', image: 'bad' },
      { ok: true, code: 'OK', data: [] },
    ])
      expect(() => parseResult(value)).toThrow()
  })
})

describe('HTTP 管理接口与手机入口', () => {
  test('非法恢复信息返回 400，合法恢复信息可在状态中读取', async () => {
    const storage = memory()
    const bridge = new Bridge(storage)
    const pair = bridge.pair()
    const admin = new Hono()
    const phone = new Hono()
    registerRoutes(admin, storage, (v) => v)
    registerRoutes(phone, storage, (v) => v, true)
    const poll = (resumed: unknown) =>
      phone.request('/poll', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pair.token}`,
          'X-Device-Id': pair.deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ protocol: 1, ready: true, resumed }),
      })
    for (const resumed of [
      null,
      [],
      { offlineMs: -1, cause: 'frozen' },
      { offlineMs: 0, cause: 'unknown' },
      { offlineMs: 0, cause: 'network', error: 42 },
    ]) {
      const response = await poll(resumed)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' })
    }
    expect(bridge.status().lastSeen).toBe(0)
    expect(bridge.disconnects()).toEqual([])
    expect((await poll({ offlineMs: 123, cause: 'frozen', error: 'x'.repeat(201) })).status).toBe(200)
    const status = await (await admin.request('/status')).json()
    expect(status).toMatchObject({
      disconnects: [{ cause: 'frozen', appOfflineMs: 123, error: 'x'.repeat(200) }],
    })
  })

  test('配对→鉴权→派发→回报→读取→撤销完整闭环', async () => {
    const storage = memory()
    const admin = new Hono()
    const phone = new Hono()
    registerRoutes(admin, storage, (v) => v)
    registerRoutes(phone, storage, (v) => v, true)
    const pairing = (await (await admin.request('/pair', { method: 'POST' })).json()) as {
      token: string
      deviceId: string
    }
    const headers = {
      Authorization: `Bearer ${pairing.token}`,
      'X-Device-Id': pairing.deviceId,
      'Content-Type': 'application/json',
    }
    const post = (app: Hono, path: string, value: unknown, auth = headers) =>
      app.request(path, { method: 'POST', headers: auth, body: JSON.stringify(value) })
    expect(
      (await post(phone, '/poll', { protocol: 1, ready: true }, { ...headers, Authorization: 'Bearer wrong' })).status,
    ).toBe(401)
    expect((await post(phone, '/poll', { protocol: 2, ready: true })).status).toBe(400)
    expect((await post(phone, '/poll', { protocol: 1, ready: true })).status).toBe(200)
    const submitted = await post(admin, '/commands', { action: 'observe' })
    expect(submitted.status).toBe(202)
    const { id } = (await submitted.json()) as { id: string }
    const delivery = (await (await post(phone, '/poll', { protocol: 1, ready: true })).json()) as {
      job: { id: string }
    }
    expect(delivery.job.id).toBe(id)
    expect((await post(phone, '/result', { id, result: { ok: true, code: 'OK', data: { nodes: [] } } })).status).toBe(
      200,
    )
    const read = await admin.request(`/commands/${id}`)
    expect(read.headers.get('Cache-Control')).toBe('no-store')
    expect(await read.json()).toEqual({ result: { ok: true, code: 'OK', data: { nodes: [] } } })
    await post(admin, '/revoke', {})
    expect((await post(phone, '/poll', { protocol: 1, ready: true })).status).toBe(401)
  })
  test('恶意及超大正文不创建指令，管理入口不能从手机入口访问', async () => {
    const storage = memory()
    const admin = new Hono()
    const phone = new Hono()
    registerRoutes(admin, storage, (v) => v)
    registerRoutes(phone, storage, (v) => v, true)
    expect((await admin.request('/commands', { method: 'POST', body: '{' })).status).toBe(400)
    expect(
      (await admin.request('/commands', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(20000) }) })).status,
    ).toBe(400)
    const pair = new Bridge(storage).pair()
    expect(
      (
        await phone.request('/pair', {
          method: 'POST',
          headers: { Authorization: `Bearer ${pair.token}`, 'X-Device-Id': pair.deviceId },
        })
      ).status,
    ).toBe(404)
    expect(storage.get('job')).toBeUndefined()
  })
})

describe('本机地址推荐', () => {
  test('只列出非回环的内网 / VPN IPv4，容器内不推荐', () => {
    const nic = (address: string, family = 'IPv4', internal = false) => ({ address, family, internal }) as never
    const interfaces = {
      lo0: [nic('127.0.0.1', 'IPv4', true)],
      en0: [nic('192.168.1.5'), nic('fe80::1', 'IPv6')],
      utun3: [nic('100.101.102.103')],
      en1: [nic('8.8.8.8'), nic('192.168.1.5')],
    }
    expect(localAddresses(interfaces, false)).toEqual(['192.168.1.5', '100.101.102.103'])
    expect(localAddresses(interfaces, true)).toEqual([])
    expect(isPrivateIpv4('172.16.0.1')).toBe(true)
    expect(isPrivateIpv4('172.32.0.1')).toBe(false)
  })
})

describe('拖动协议', () => {
  const base = { action: 'drag' as const, x: 0, y: 1, endX: 1, endY: 0 }
  test('默认值、边界和途经点', () => {
    expect(parseCommand(base)).toEqual({ ...base, hold: 0, duration: 600, rest: 150 })
    for (const values of [
      { hold: 0, duration: 100, rest: 0 },
      { hold: 2000, duration: 3000, rest: 1000 },
    ])
      expect(
        parseCommand({
          ...base,
          ...values,
          points: [
            [0, 1],
            [1, 0],
          ],
        }),
      ).toEqual({
        ...base,
        ...values,
        points: [
          [0, 1],
          [1, 0],
        ],
      })
  })
  test('拒绝越界、非整数和无效途经点', () => {
    for (const [key, values] of Object.entries({
      x: [-0.1, 1.1, NaN, Infinity, '0', null],
      y: [-1, 2, NaN],
      endX: [-1, 2, Infinity],
      endY: [-1, 2, NaN],
      hold: [-1, 2001, 0.5, NaN, Infinity, '1', null],
      duration: [99, 3001, 100.5, NaN, Infinity, '600', null],
      rest: [-1, 1001, 0.5, NaN, Infinity, '150', null],
      points: [
        Array.from({ length: 17 }, () => [0, 0]),
        [[-1, 0]],
        [[0, 2]],
        [[NaN, 0]],
        [[Infinity, 0]],
        [[0]],
        [[0, 0, 0]],
        [null],
        'bad',
      ],
    })) {
      for (const value of values) expect(() => parseCommand({ ...base, [key]: value })).toThrow('INVALID_INPUT')
    }
    for (const key of ['x', 'y', 'endX', 'endY'])
      expect(() => parseCommand({ ...base, [key]: undefined })).toThrow('INVALID_INPUT')
  })
  test('swipe 继续接受途经点并保留自己的时长范围', () => {
    expect(parseCommand({ ...base, action: 'swipe', points: [[0.5, 0.5]] })).toEqual({
      ...base,
      action: 'swipe',
      duration: 500,
      points: [[0.5, 0.5]],
    })
    expect(() => parseCommand({ ...base, action: 'swipe', duration: 2001 })).toThrow('INVALID_INPUT')
    expect(() => parseCommand({ ...base, action: 'swipe', points: [[0, 2]] })).toThrow('INVALID_INPUT')
  })
})

test('type 密码标记只接受缺省或 true', () => {
  expect(parseCommand({ action: 'type', text: 'secret' })).toEqual({ action: 'type', text: 'secret' })
  expect(parseCommand({ action: 'type', text: 'secret', password: true })).toEqual({
    action: 'type',
    text: 'secret',
    password: true,
  })
  for (const password of [false, null, 0, 1, '', 'true', [], {}])
    expect(() => parseCommand({ action: 'type', text: 'secret', password })).toThrow('INVALID_INPUT')
})

test('在线窗口容忍四十秒间隔；成功回报刷新在线时间且不记录断线', () => {
  const { bridge, pair, advance } = setup()
  advance(40_000)
  expect(bridge.status().online).toBe(true)
  advance(10_000)
  expect(bridge.status().online).toBe(false)
  bridge.poll(pair.deviceId, true)
  const disconnects = bridge.disconnects()
  const id = bridge.enqueue({ action: 'home' })
  bridge.poll(pair.deviceId, true)
  advance(20_000)
  expect(bridge.finish(pair.deviceId, id, { ok: true, code: 'OK' })).toBe(true)
  expect(bridge.status().lastSeen).toBe(71_000)
  expect(bridge.disconnects()).toEqual(disconnects)
  advance(40_000)
  expect(bridge.status().online).toBe(true)
})

test('入队暂时离线或忙碌会每秒重试；三十秒仍失败保留错误码，取消及时退出', async () => {
  const originalScale = timing.scale
  timing.scale = 0
  try {
    for (const code of ['DEVICE_OFFLINE', 'DEVICE_BUSY']) {
      const { bridge, pair, advance } = setup()
      if (code === 'DEVICE_OFFLINE') advance(50_000)
      else bridge.enqueue({ action: 'home' })
      const enqueue = bridge.enqueue.bind(bridge)
      let attempts = 0
      bridge.enqueue = (command, taskId) => {
        attempts++
        advance(1000)
        if (attempts === 4) {
          bridge.cancel()
          bridge.poll(pair.deviceId, true)
        }
        const id = enqueue(command, taskId)
        bridge.poll(pair.deviceId, true)
        bridge.finish(pair.deviceId, id, { ok: true, code: 'OK' })
        return id
      }
      expect(await runCommand(bridge, { action: 'home' }, new AbortController().signal)).toMatchObject({ ok: true })
      expect(attempts).toBe(4)
    }
    for (const code of ['DEVICE_OFFLINE', 'DEVICE_BUSY']) {
      const { bridge } = setup()
      let attempts = 0
      bridge.enqueue = () => {
        attempts++
        throw Error(code)
      }
      await expect(runCommand(bridge, { action: 'home' }, new AbortController().signal)).rejects.toThrow(code)
      expect(attempts).toBe(31)
      const controller = new AbortController()
      const pending = runCommand(bridge, { action: 'home' }, controller.signal)
      controller.abort()
      await expect(pending).rejects.toThrow('CANCELLED')
    }
  } finally {
    timing.scale = originalScale
  }
})
