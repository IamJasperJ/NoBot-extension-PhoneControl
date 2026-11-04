import { describe, expect, test } from 'bun:test'
import { Hono } from '../../apps/server/node_modules/hono'
import type { ExtensionStorage } from '../../apps/server/src/extensions/types'
import { Bridge } from './bridge'
import { parseCommand, parseResult } from './protocol'
import { isPrivateIpv4, localAddresses, registerRoutes } from './routes'

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
    advance(16000)
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
