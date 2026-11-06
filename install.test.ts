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
    const timeout = setTimeout(() => child.kill(), 55000)
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
  await registry.configureExtension('phone-control', { enabled: true, approvePermissions: true })
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

  // 操作员走真实宿主：会话连接 → 模型收到带编号框的截图 → 按回答操作手机 → done
  // 宿主测试工具按运行时路径加载：它跟着宿主的类型配置走，不纳入插件的类型检查
  const helper = '../../apps/server/test/helpers/mockLlm'
  const { mockLlm } = (await import(helper)) as {
    mockLlm: () => {
      url: string
      requests: { messages: unknown[] }[]
      setScript(next: () => { text: string }): void
      stop(): unknown
    }
  }
  const llm = mockLlm()
  try {
    const { createApiPreset, setDefaultApiPreset } = await import('../../apps/server/src/services/connections')
    setDefaultApiPreset(createApiPreset({ name: 'Operator', baseUrl: llm.url, model: 'mock-one', vision: 'yes' }).id)
    const { createCharacter } = await import('../../apps/server/src/services/characters')
    const { createChat } = await import('../../apps/server/src/services/chats')
    const chat = createChat({ characterId: createCharacter({ name: '小雪', personality: '喜欢猫' }).id })
    registry.updateExtension('phone-control', { settings: { chatId: chat.id } })
    const replies = [
      '{"thought":"看看推荐","action":{"type":"tap","element":1},"memory":"首页有猫"}',
      '{"thought":"好了","action":{"type":"done","summary":"看了首页推荐。"}}',
    ]
    llm.setScript(() => ({ text: replies.shift() ?? '{"action":{"type":"done","summary":""}}' }))
    const sharp = (await import('../../apps/server/node_modules/sharp')).default
    const screenshot = (
      await sharp({ create: { width: 540, height: 1200, channels: 3, background: '#eeeeee' } })
        .jpeg()
        .toBuffer()
    ).toString('base64')
    // 模拟手机：持续轮询并回报
    let running = true
    const commands: string[] = []
    const device = (async () => {
      while (running) {
        const response = (await (await phone('poll', { protocol: 1, ready: true })).json()) as {
          job: { id: string; command: { action: string } } | null
        }
        if (response.job) {
          commands.push(response.job.command.action)
          const observe = response.job.command.action === 'observe'
          await phone('result', {
            id: response.job.id,
            result: {
              ok: true,
              code: 'OK',
              ...(observe
                ? {
                    image: screenshot,
                    data: {
                      width: 1080,
                      height: 2400,
                      packageName: 'tv.danmaku.bili',
                      nodes: [{ text: '推荐', clickable: true, bounds: [0, 200, 300, 320] }],
                    },
                  }
                : {}),
            },
          })
        }
        await Bun.sleep(20)
      }
    })()
    const { availableTools } = await import('../../apps/server/src/tools')
    const task = availableTools(chat.id).find((entry) => entry.tool.name === 'phone_task')?.tool
    expect(task).toBeDefined()
    const result = await task!.run(
      { goal: '看看 B 站首页', wait: true },
      { chatId: chat.id, vars: {}, signal: new AbortController().signal },
    )
    running = false
    await device
    expect(result.content).toContain('Phone task finished')
    expect(result.content).toContain('首页有猫')
    expect(commands).toEqual(['observe', 'tap', 'observe'])
    // 第一次请求：最后一条是文字 + 截图，截图已经画了编号（与手机原图不同）
    const last = llm.requests[0]?.messages.at(-1) as {
      content: { type: string; image_url?: { url: string } }[]
    }
    expect(last.content.map((part) => part.type)).toEqual(['text', 'image_url'])
    expect(last.content[1]?.image_url?.url.startsWith('data:image/')).toBe(true)
    const status = (await (await app.request('/api/ext/phone-control/task')).json()) as {
      task: { status: string; steps: unknown[] }
      memories: { summary: string }[]
    }
    expect(status.task.status).toBe('done')
    expect(status.task.steps.length).toBe(2)
    expect(status.memories[0]?.summary).toBe('看了首页推荐。')
  } finally {
    llm.stop()
  }

  registry.updateExtension('phone-control', { enabled: false })
  expect((await phone('poll', { protocol: 1, ready: true })).status).toBe(404)
}, 60000)
