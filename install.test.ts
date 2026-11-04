import { expect, test } from 'bun:test'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 真正复制到用户数据目录并经过宿主加载，防止类型导入或安装路径造成部署后才报错。
test('安装后的插件经过真实宿主完成配对与手机回报', async () => {
  if (!process.env.PHONE_INSTALL_TEST_CHILD) {
    const directory = await mkdtemp(join(tmpdir(), 'nobot-phone-install-'))
    const child = Bun.spawn([process.execPath, 'test', import.meta.path], {
      env: { ...process.env, DATA_DIR: directory, PHONE_INSTALL_TEST_CHILD: '1', NOBOT_ADMIN_PASSWORD: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const timeout = setTimeout(() => child.kill(), 25000)
    try {
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      expect(code, out + err).toBe(0)
    } finally {
      clearTimeout(timeout)
      await rm(directory, { recursive: true, force: true })
    }
    return
  }
  const destination = join(process.env.DATA_DIR ?? '', 'users/test/extensions/phone-control')
  await mkdir(destination, { recursive: true })
  for (const name of [
    'manifest.json',
    'client.js',
    'style.css',
    'server.ts',
    'bridge.ts',
    'protocol.ts',
    'routes.ts',
    'tools.ts',
    'i18n.ts',
    'host.ts',
    'commands.ts',
    'operator.ts',
    'marks.ts',
    'tasks.ts',
  ])
    await copyFile(join(import.meta.dir, name), join(destination, name))
  await (await import('../../apps/server/src/bootstrap')).bootstrap()
  await (await import('../../apps/server/src/services/auth')).createUser({
    handle: 'test',
    name: 'test',
    password: 'phone-test-password',
    isAdmin: false,
  })
  const registry = await import('../../apps/server/src/extensions/registry')
  await registry.ensureUserExtensions()
  const loaded = registry.listExtensions().find((entry) => entry.id === 'phone-control')
  expect(loaded?.loadError).toBeUndefined()
  expect(loaded?.id).toBe('phone-control')
  expect(loaded?.client).toEqual({ script: true, style: true })
  registry.updateExtension('phone-control', { enabled: true, approvePermissions: true })
  const { app } = await import('../../apps/server/src/app')
  const clientAsset = await app.request('/api/extensions/phone-control/client.js')
  expect(clientAsset.status).toBe(200)
  expect(await clientAsset.text()).toContain("id: 'pairing'")
  const styleAsset = await app.request('/api/extensions/phone-control/style.css')
  expect(styleAsset.status).toBe(200)
  expect(await styleAsset.text()).toContain('.pc-page')
  const pairResponse = await app.request('/api/ext/phone-control/pair', { method: 'POST' })
  expect(pairResponse.status).toBe(200)
  const pair = (await pairResponse.json()) as { token: string; deviceId: string }
  const phone = (path: string, data: unknown, token = pair.token) =>
    registry.forwardPublicExtension(
      'phone-control',
      'test',
      new Request(`http://localhost/hooks/phone-control/test/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': pair.deviceId, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    )
  expect((await phone('poll', { protocol: 1, ready: true }, 'wrong')).status).toBe(401)
  expect((await phone('poll', { protocol: 1, ready: true })).status).toBe(200)
  const submitted = await app.request('/api/ext/phone-control/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'home' }),
  })
  expect(submitted.status).toBe(202)
  const job = (await submitted.json()) as { id: string }
  const delivery = (await (await phone('poll', { protocol: 1, ready: true })).json()) as { job: { id: string } }
  expect(delivery.job.id).toBe(job.id)
  expect((await phone('result', { id: job.id, result: { ok: true, code: 'OK' } })).status).toBe(200)
  expect(await (await app.request(`/api/ext/phone-control/commands/${job.id}`)).json()).toEqual({
    result: { ok: true, code: 'OK' },
  })
  expect((await phone('result', { id: job.id, result: { ok: 'bad' } })).status).toBe(400)
  registry.updateExtension('phone-control', { enabled: false })
  expect((await phone('poll', { protocol: 1, ready: true })).status).toBe(404)
}, 30000)
