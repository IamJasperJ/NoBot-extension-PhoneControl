import { afterAll, beforeAll, expect, test } from 'bun:test'
import activate, {
  checkEndpoint,
  createPairingController,
  defaultEndpoint,
  en,
  encodeQr,
  loadChatOptions,
  pairingLink,
  privateHost,
  qrPath,
} from './client.js'

let previous
beforeAll(() => {
  previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'zh' } } })
})
afterAll(() => {
  if (previous) Object.defineProperty(globalThis, 'document', previous)
  else Reflect.deleteProperty(globalThis, 'document')
})
const unpaired = { paired: false, online: false, ready: false, lastSeen: null, job: null }
const pair = { deviceId: 'device', token: 'secret', protocol: 1 }
function fixture(fetchServer) {
  let state
  const api = { api: { authMe: async () => ({ handle: 'owner' }) }, fetchServer }
  const controller = createPairingController(api, (value) => {
    state = value
  })
  return { controller, state: () => state }
}

test('配对成功保留一次性密钥，撤销后清除', async () => {
  const calls = []
  const f = fixture(async (path, init) => {
    calls.push([path, init.method])
    return Response.json(path === '/status' ? unpaired : path === '/pair' ? pair : { ok: true })
  })
  await f.controller.refresh()
  expect(f.state().handle).toBe('owner')
  await f.controller.mutate('pair')
  expect(f.state().pair).toEqual(pair)
  expect(f.state().status.paired).toBe(true)
  await f.controller.mutate('revoke')
  expect(f.state().pair).toBeNull()
  expect(f.state().status.paired).toBe(false)
  expect(calls).toEqual([
    ['/status', 'GET'],
    ['/pair', 'POST'],
    ['/revoke', 'POST'],
  ])
  f.controller.dispose()
})
test('旧状态刷新不会覆盖新配对，重复点击不发出两次配对', async () => {
  let resolveStatus, resolvePair
  let pairs = 0
  const f = fixture(async (path) => {
    if (path === '/status')
      return new Promise((resolve) => {
        resolveStatus = resolve
      })
    pairs++
    return new Promise((resolve) => {
      resolvePair = resolve
    })
  })
  const refreshing = f.controller.refresh()
  const pairing = f.controller.mutate('pair')
  await f.controller.mutate('pair')
  resolvePair(Response.json(pair))
  await pairing
  resolveStatus(Response.json(unpaired))
  await refreshing
  expect(pairs).toBe(1)
  expect(f.state().pair).toEqual(pair)
  f.controller.dispose()
})
test('卸载中止请求，迟到回报不再通知界面', async () => {
  let resolve, signal
  const f = fixture(async (_path, init) => {
    signal = init.signal
    return new Promise((done) => {
      resolve = done
    })
  })
  const pending = f.controller.mutate('pair')
  const before = f.state()
  f.controller.dispose()
  expect(signal.aborted).toBe(true)
  resolve(Response.json(pair))
  await pending
  expect(f.state()).toBe(before)
  expect(f.state().pair).toBeNull()
})
test('撤销失败保留原凭据；其他页面重新配对后清除旧密钥', async () => {
  const f = fixture(async (path) =>
    path === '/revoke'
      ? new Response('', { status: 500 })
      : Response.json(path === '/pair' ? pair : { ...unpaired, paired: true, deviceId: 'another-device' }),
  )
  await f.controller.mutate('pair')
  await f.controller.mutate('revoke')
  expect(f.state().pair).toEqual(pair)
  expect(f.state().error).toBe('请求失败')
  await f.controller.refresh()
  expect(f.state().pair).toBeNull()
  expect(f.state().error).toBe('')
  f.controller.dispose()
})
test('管理标签和设置快捷入口均注册，全部页面文案有英文', async () => {
  const pages = [],
    slots = []
  activate({
    React: {},
    registerPage: (page) => pages.push(page),
    registerSlot: (name, contribution) => slots.push([name, contribution]),
  })
  expect(pages[0].id).toBe('pairing')
  expect(pages[0].label).toBe('配对管理')
  expect(slots[0][0]).toBe('extensions.settings.footer')
  document.documentElement.lang = 'en'
  const english = []
  activate({ React: {}, registerPage: (page) => english.push(page), registerSlot() {} })
  expect(english[0].label).toBe('Pairing')
  document.documentElement.lang = 'zh'
  const source = await Bun.file(new URL('./client.js', import.meta.url)).text()
  for (const match of source.matchAll(/'([^'\n]*[\u4e00-\u9fff][^'\n]*)'/g)) expect(en[match[1]], match[1]).toBeString()
})

const hook = '/hooks/phone-control/owner'
test('手机入口：HTTPS 任意主机，HTTP 只限内网 / VPN，与安卓端规则一致', () => {
  const code = (url) => checkEndpoint(url, 'owner').code
  expect(code(`https://nobot.example.com${hook}`)).toBe('ok')
  expect(code(`https://8.8.8.8${hook}/`)).toBe('ok')
  for (const host of [
    '192.168.1.5:3100',
    '10.0.0.2',
    '172.20.1.1',
    '100.100.1.1',
    '[fd00::1]',
    '[fe80::1]',
    '169.254.3.4',
  ])
    expect(code(`http://${host}${hook}`), host).toBe('http')
  for (const host of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '[2001:db8::1]', '192.169.0.1'])
    expect(code(`http://${host}${hook}`), host).toBe('public-http')
  expect(code(`http://nas.lan${hook}`)).toBe('http-name')
  expect(code(`http://localhost:5173${hook}`)).toBe('loopback')
  expect(code(`http://127.0.0.1${hook}`)).toBe('loopback')
  expect(code(`https://a.com/hooks/phone-control/other`)).toBe('path')
  for (const url of [`https://a.com${hook}?x=1`, `https://u:p@a.com${hook}`, `ftp://a.com${hook}`, 'not a url'])
    expect(code(url), url).toBe('invalid')
  expect(checkEndpoint(`http://192.168.1.5${hook}`, 'owner').level).toBe('warn')
  expect(checkEndpoint(`http://8.8.8.8${hook}`, 'owner').level).toBe('error')
  expect(privateHost('[::ffff:c0a8:101]')).toBe(true)
  expect(privateHost('nobot.example.com')).toBeNull()
  expect(defaultEndpoint('https://a.com', 'o w')).toBe('https://a.com/hooks/phone-control/o%20w')
})
test('配对链接编码入口，去掉末尾斜杠', () => {
  const link = pairingLink(` http://192.168.1.5:3100/nobot${hook}/ `, {
    deviceId: 'a'.repeat(32),
    token: 'b'.repeat(64),
  })
  expect(link).toBe(
    `nobot-phone://pair?v=1&url=${encodeURIComponent(`http://192.168.1.5:3100/nobot${hook}`)}&device=${'a'.repeat(32)}&token=${'b'.repeat(64)}`,
  )
  const url = new URL(link)
  expect(url.searchParams.get('url')).toBe(`http://192.168.1.5:3100/nobot${hook}`)
})
test('二维码：版本随长度增长，定位图案和时序图案正确', () => {
  const small = encodeQr('hi')
  expect(small.length).toBe(21)
  const link = pairingLink(`https://nobot.example.com${hook}`, { deviceId: 'a'.repeat(32), token: 'b'.repeat(64) })
  const big = encodeQr(link)
  const size = big.length
  expect(size).toBeGreaterThan(41)
  expect((size - 17) % 4).toBe(0)
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    expect(big[cy][cx]).toBe(true)
    expect(big[cy][cx + 2]).toBe(false)
    expect(big[cy][cx + 3]).toBe(true)
  }
  for (let i = 8; i < size - 8; i++) expect(big[6][i]).toBe(i % 2 === 0)
  expect(big[size - 8][8]).toBe(true)
  expect(qrPath([[true, false]], 1)).toBe('M1,1h1v1h-1z')
  expect(() => encodeQr('x'.repeat(3000))).toThrow('QR_TOO_LONG')
})
test('会话选项合并角色和群组，按最近更新排序', async () => {
  const options = await loadChatOptions({
    api: {
      listCharacters: async () => [{ id: 'c1', name: '小雪' }],
      listGroups: async () => [{ id: 'g1', name: '群' }],
      listChats: async ({ characterId }) =>
        characterId ? [{ id: 'a', title: '旧', updatedAt: 1 }] : [{ id: 'b', title: '新', updatedAt: 2 }],
    },
  })
  expect(options).toEqual([
    { id: 'b', title: '新', owner: '群', updatedAt: 2 },
    { id: 'a', title: '旧', owner: '小雪', updatedAt: 1 },
  ])
})
