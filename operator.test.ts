import { describe, expect, test } from 'bun:test'
import {
  blockedApp,
  blockedWord,
  elementAt,
  type Goal,
  humanDrag,
  humanScroll,
  humanTap,
  matchApp,
  type OperatorPorts,
  parseDecision,
  pointIn,
  readScreen,
  runOperator,
  STRICT_POLICY,
  systemPrompt,
} from './operator'
import type { Command, Result } from './protocol'

/** 固定序列的伪随机数，测试可复现 */
function sequence(seed = 1) {
  let x = seed
  return () => {
    x = (x * 16807) % 2147483647
    return x / 2147483647
  }
}

const screenData = (extra: { text: string; clickable?: boolean; bounds: number[] }[] = []) => ({
  width: 1000,
  height: 2000,
  packageName: 'com.example',
  nodes: [
    { text: '推荐', clickable: true, bounds: [0, 100, 200, 200] },
    // 与上面同一位置的子节点，只留一个编号
    { text: '推荐', clickable: true, bounds: [2, 102, 198, 198] },
    { description: '搜索', clickable: true, editable: true, bounds: [300, 100, 900, 200] },
    { text: '一段说明文字', clickable: false, bounds: [0, 300, 1000, 400] },
    { text: 'tiny', clickable: true, bounds: [0, 0, 2, 2] },
    ...extra,
  ],
})

describe('屏幕整理', () => {
  test('可点元素编号、去掉重叠和过小的，其余文字单独列出', () => {
    const screen = readScreen(screenData())
    expect(screen.elements.map((e) => [e.id, e.label, e.editable])).toEqual([
      [1, '推荐', false],
      [2, '搜索', true],
    ])
    expect(screen.texts).toEqual(['一段说明文字'])
    expect(screen.packageName).toBe('com.example')
  })
  test('缺数据时得到空屏幕而不是报错', () => {
    expect(readScreen(undefined)).toEqual({ packageName: '', width: 0, height: 0, elements: [], texts: [] })
  })
})

describe('拟人手势', () => {
  const screen = readScreen(screenData())
  test('点按落在元素内侧、不总在正中心，按下时长 60–140 毫秒', () => {
    const random = sequence(7)
    const points = Array.from({ length: 50 }, () => pointIn(screen.elements[1]!, screen, random))
    for (const p of points) {
      expect(p.x * 1000).toBeGreaterThan(300 + 600 * 0.15 - 1)
      expect(p.x * 1000).toBeLessThan(900 - 600 * 0.15 + 1)
      expect(p.y * 2000).toBeGreaterThan(100 + 100 * 0.15 - 1)
      expect(p.y * 2000).toBeLessThan(200 - 100 * 0.15 + 1)
    }
    expect(new Set(points.map((p) => p.x.toFixed(3))).size).toBeGreaterThan(10)
    const tap = humanTap(points[0]!, random) as Extract<Command, { action: 'tap' }>
    expect(tap.duration).toBeGreaterThanOrEqual(60)
    expect(tap.duration).toBeLessThanOrEqual(140)
  })
  test('滚动：down 是手指往上划，轨迹带途经点、都在屏幕内，每次不一样', () => {
    const random = sequence(3)
    const down = humanScroll('down', 'medium', random) as Extract<Command, { action: 'swipe' }>
    expect(down.y).toBeGreaterThan(down.endY)
    expect(down.points?.length).toBe(7)
    for (const [x, y] of down.points ?? []) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
    const up = humanScroll('up', 'long', random) as Extract<Command, { action: 'swipe' }>
    expect(up.y).toBeLessThan(up.endY)
    const right = humanScroll('right', 'short', random) as Extract<Command, { action: 'swipe' }>
    expect(right.x).toBeGreaterThan(right.endX)
    expect(humanScroll('down', 'medium', random)).not.toEqual(down)
  })
})

describe('解析模型回答', () => {
  test('允许代码块和前后废话，补全默认值', () => {
    expect(parseDecision('好的：\n```json\n{"thought":"嗯","action":{"type":"scroll"}}\n```')).toEqual({
      thought: '嗯',
      action: { type: 'scroll', direction: 'down', distance: 'medium' },
      memory: undefined,
    })
    expect(parseDecision('{"action":{"type":"wait","seconds":99},"memory":" 记一下 "}')).toEqual({
      thought: '',
      action: { type: 'wait', seconds: 30 },
      memory: '记一下',
    })
    // 字符串里的大括号不影响取对象
    expect(
      parseDecision('{"thought":"a}b","action":{"type":"type","text":"{hi}","element":2,"submit":true}}').action,
    ).toEqual({
      type: 'type',
      text: '{hi}',
      element: 2,
      submit: true,
    })
  })
  test('不合法时抛出能告诉模型的原因', () => {
    expect(() => parseDecision('我觉得应该点推荐')).toThrow('no JSON object found')
    expect(() => parseDecision('{"action":{"type":"fly"}}')).toThrow('unknown action type')
    expect(() => parseDecision('{"action":{"type":"tap"}}')).toThrow('tap needs')
    expect(() => parseDecision('{"thought":"x"}')).toThrow('missing "action"')
  })
  test('按名字找应用', () => {
    const apps = [
      { label: '哔哩哔哩', packageName: 'tv.danmaku.bili' },
      { label: '小红书', packageName: 'com.xingin.xhs' },
      { label: 'WeChat', packageName: 'com.tencent.mm' },
    ]
    expect(matchApp('小红书', apps)?.packageName).toBe('com.xingin.xhs')
    expect(matchApp('wechat', apps)?.packageName).toBe('com.tencent.mm')
    expect(matchApp('bili', apps)?.packageName).toBe('tv.danmaku.bili')
    expect(matchApp('抖音', apps)).toBeUndefined()
  })
})

/** 假端口：手机按脚本回报，模型按脚本回答，时间可快进 */
function ports(replies: string[], phone: (command: Command) => Result = () => ({ ok: true, code: 'OK' })) {
  let time = 0
  const commands: Command[] = []
  const prompts: string[] = []
  const p: OperatorPorts = {
    async act(command) {
      commands.push(command)
      if (command.action === 'observe') return { ok: true, code: 'OK', data: screenData(), image: '/9j/2Q==' }
      return phone(command)
    },
    async think(messages) {
      prompts.push(messages.at(-1)?.content ?? '')
      return replies.shift() ?? '{"action":{"type":"done","summary":"end"}}'
    },
    mark: async (image) => image,
    sleep: async (ms) => {
      time += ms
    },
    now: () => time,
    random: sequence(5),
  }
  return {
    p,
    commands,
    prompts,
    advance: (ms: number) => {
      time += ms
    },
  }
}
const goal = (extra: Partial<Goal> = {}): Goal => ({
  goal: '刷会儿',
  name: '小雪',
  persona: '喜欢猫',
  maxSteps: 20,
  maxMs: 600_000,
  ...extra,
})

describe('操作员主循环', () => {
  test('一直做到模型说 done；点元素换算成屏幕内的坐标；没变化的屏幕会被标出来', async () => {
    const f = ports([
      '{"thought":"点推荐","action":{"type":"tap","element":1}}',
      '{"thought":"打字","action":{"type":"type","element":2,"text":"猫","submit":true}}',
      '{"thought":"好了","action":{"type":"done","summary":"搜了猫"}}',
    ])
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    expect(report.endReason).toBe('done')
    expect(report.summary).toBe('搜了猫')
    expect(f.commands.map((c) => c.action)).toEqual(['observe', 'tap', 'observe', 'tap', 'type', 'enter', 'observe'])
    const tap = f.commands[1] as Extract<Command, { action: 'tap' }>
    expect(tap.x).toBeLessThan(0.2)
    expect(tap.y).toBeGreaterThan(0.05)
    expect(tap.y).toBeLessThan(0.1)
    // 假手机每次界面一样，第二轮提示里会看到 screen unchanged
    expect(f.prompts[1]).toContain('(screen unchanged)')
    expect(report.steps.map((s) => s.action)).toEqual(['tap [1] "推荐"', 'type [2] "搜索" "猫" + enter', 'done'])
  })

  test('回答格式错了会把原因告诉模型再来一次，不会就此停下', async () => {
    const f = ports(['我想点推荐', '{"action":{"type":"done","summary":"ok"}}'])
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    expect(report.endReason).toBe('done')
    expect(f.prompts[1]).toContain('could not be used (no JSON object found)')
  })

  test('时间用完：停下并让模型补一段回顾', async () => {
    const f = ports([
      '{"action":{"type":"wait","seconds":30}}',
      '{"action":{"type":"wait","seconds":30}}',
      '刚才看了两个视频。',
    ])
    const report = await runOperator(goal({ maxMs: 50_000 }), f.p, new AbortController().signal)
    expect(report.endReason).toBe('time')
    expect(report.summary).toBe('刚才看了两个视频。')
  })

  test('步数用完同样补回顾；模型预算提示里写着剩余步数', async () => {
    const f = ports(['{"action":{"type":"back"}}', '{"action":{"type":"back"}}', '回顾'])
    const report = await runOperator(goal({ maxSteps: 2 }), f.p, new AbortController().signal)
    expect(report.endReason).toBe('steps')
    expect(f.prompts[0]).toContain('2 steps')
    expect(report.summary).toBe('回顾')
  })

  test('手机锁着就放弃，不反复重试', async () => {
    const f = ports([])
    f.p.act = async (command) => {
      f.commands.push(command)
      return { ok: false, code: 'DEVICE_LOCKED' }
    }
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    expect(report.endReason).toBe('gave_up')
    expect(f.commands.length).toBe(1)
  })

  test('打开应用：先列出已安装应用再按名字匹配；找不到时把已安装列表告诉模型', async () => {
    const f = ports(
      [
        '{"action":{"type":"open_app","name":"小红书"}}',
        '{"action":{"type":"open_app","name":"抖音"}}',
        '{"action":{"type":"done","summary":"x"}}',
      ],
      (command) =>
        command.action === 'apps'
          ? { ok: true, code: 'OK', data: { apps: [{ label: '小红书', packageName: 'com.xingin.xhs' }] } }
          : { ok: true, code: 'OK' },
    )
    await runOperator(goal(), f.p, new AbortController().signal)
    expect(f.commands.filter((c) => c.action === 'apps').length).toBe(1)
    expect(f.commands).toContainEqual({ action: 'open', packageName: 'com.xingin.xhs' })
    expect(f.prompts[2]).toContain('no installed app matches "抖音"; installed: 小红书')
  })

  test('中途被停止：结束原因是 stopped', async () => {
    const controller = new AbortController()
    const f = ports([])
    f.p.think = async () => {
      controller.abort()
      throw new Error('CANCELLED')
    }
    const report = await runOperator(goal(), f.p, controller.signal)
    expect(report.endReason).toBe('stopped')
  })
})

describe('操作限制', () => {
  test('按钮文字命中禁止类别才拦；长句里碰巧出现不算；放开后不拦；自定义词也拦', () => {
    expect(blockedWord('立即支付', STRICT_POLICY)).toBe('支付')
    expect(blockedWord('发送', STRICT_POLICY)).toBe('发送')
    expect(blockedWord('点赞 1.2万', STRICT_POLICY)).toBe('点赞')
    expect(blockedWord('Follow', STRICT_POLICY)).toBe('follow')
    expect(blockedWord('这个视频值得点赞的地方真的很多很多', STRICT_POLICY)).toBeNull()
    expect(blockedWord('推荐', STRICT_POLICY)).toBeNull()
    const relaxed = { allowed: ['like' as const], blockedApps: [], blockedWords: ['抽奖'] }
    expect(blockedWord('点赞', relaxed)).toBeNull()
    expect(blockedWord('发送', relaxed)).toBe('发送')
    expect(blockedWord('参与抽奖', relaxed)).toBe('抽奖')
  })
  test('禁止的应用：主人列的（名称或包名），以及不允许改设置时的设置应用', () => {
    const policy = { allowed: [], blockedApps: ['支付宝', 'com.tencent.mm'], blockedWords: [] }
    expect(blockedApp({ label: '支付宝', packageName: 'com.eg.android.AlipayGphone' }, policy)).toBe(true)
    expect(blockedApp({ packageName: 'com.tencent.mm' }, policy)).toBe(true)
    expect(blockedApp({ packageName: 'com.android.settings' }, policy)).toBe(true)
    expect(blockedApp({ packageName: 'com.android.settings' }, { ...policy, allowed: ['system'] })).toBe(false)
    expect(blockedApp({ label: '哔哩哔哩', packageName: 'tv.danmaku.bili' }, policy)).toBe(false)
  })
  test('按坐标找元素：取最里层的', () => {
    const screen = readScreen({
      width: 1000,
      height: 1000,
      nodes: [
        { text: '卡片', clickable: true, bounds: [0, 0, 1000, 500] },
        { text: '发送', clickable: true, bounds: [800, 400, 1000, 500] },
      ],
    })
    expect(elementAt(screen, { x: 0.9, y: 0.45 })?.label).toBe('发送')
    expect(elementAt(screen, { x: 0.1, y: 0.1 })?.label).toBe('卡片')
    expect(elementAt(screen, { x: 0.5, y: 0.9 })).toBeUndefined()
  })
  test('提示词按设置写出允许和禁止的操作', () => {
    const prompt = systemPrompt({ ...goal(), policy: { allowed: ['like'], blockedApps: ['支付宝'], blockedWords: [] } })
    expect(prompt).toContain('allows you to like, favorite or follow')
    expect(prompt).toContain('forbids these and the phone will refuse them: send messages')
    expect(prompt).toContain('Never open these apps: 支付宝')
    expect(prompt).toContain('Never enter passwords')
  })
  test('主循环：点禁止的按钮、聊天框回车、打开禁止的应用都不执行，并把原因告诉模型', async () => {
    const nodes = [
      { text: '立即支付', clickable: true, bounds: [0, 100, 500, 200] },
      { text: '说点什么', clickable: true, editable: true, bounds: [0, 300, 1000, 400] },
      { text: '搜索', clickable: true, editable: true, bounds: [0, 500, 1000, 600] },
    ]
    const f = ports(
      [
        '{"action":{"type":"tap","element":1}}',
        '{"action":{"type":"tap","x":0.2,"y":0.075}}',
        '{"action":{"type":"type","element":2,"text":"你好","submit":true}}',
        '{"action":{"type":"type","element":3,"text":"猫","submit":true}}',
        '{"action":{"type":"open_app","name":"支付宝"}}',
        '{"action":{"type":"done","summary":"x"}}',
      ],
      (command) =>
        command.action === 'apps'
          ? { ok: true, code: 'OK', data: { apps: [{ label: '支付宝', packageName: 'com.eg.android.AlipayGphone' }] } }
          : { ok: true, code: 'OK' },
    )
    const inner = f.p.act
    f.p.act = async (command) => {
      if (command.action !== 'observe') return inner(command)
      f.commands.push(command)
      return {
        ok: true,
        code: 'OK',
        data: { width: 1000, height: 2000, packageName: 'com.shop', nodes },
        image: '/9j/2Q==',
      }
    }
    const report = await runOperator(
      { ...goal(), policy: { allowed: [], blockedApps: ['支付宝'], blockedWords: [] } },
      f.p,
      new AbortController().signal,
    )
    const results = report.steps.map((s) => s.result)
    expect(results[0]).toBe('blocked by the owner\'s settings ("支付")')
    expect(results[1]).toBe('blocked by the owner\'s settings ("支付")')
    expect(results[2]).toContain('pressing enter was blocked')
    expect(results[3]).toStartWith('OK')
    expect(results[4]).toBe('"支付宝" is blocked by the owner\'s settings')
    const acted = f.commands.map((c) => c.action).filter((a) => a !== 'observe')
    // 只执行了：点聊天框、输入、点搜索框、输入、回车、列应用；没有点支付、没有打开支付宝
    expect(acted).toEqual(['tap', 'type', 'tap', 'type', 'enter', 'apps'])
  })
  test('输入前聚焦：拒绝非输入框、受限文字和不存在的元素，不产生点击、输入或回车', async () => {
    const nodes = [
      { text: '删除', clickable: true, bounds: [0, 100, 500, 200] },
      { text: '展开', clickable: true, bounds: [0, 300, 500, 400] },
      { text: '支付', editable: true, bounds: [0, 500, 500, 600] },
      { text: '禁止输入', editable: true, bounds: [0, 700, 500, 800] },
      { text: '搜索', editable: true, bounds: [0, 900, 500, 1000] },
    ]
    const f = ports([
      ...[1, 2, 3, 4, 99, 5].map((element) =>
        JSON.stringify({ action: { type: 'type', element, text: '猫', submit: true } }),
      ),
      '{"action":{"type":"done","summary":"x"}}',
    ])
    const inner = f.p.act
    f.p.act = async (command) => {
      if (command.action !== 'observe') return inner(command)
      f.commands.push(command)
      return { ok: true, code: 'OK', data: { width: 1000, height: 2000, packageName: 'com.example', nodes } }
    }
    const report = await runOperator(
      goal({ policy: { allowed: [], blockedApps: [], blockedWords: ['禁止输入'] } }),
      f.p,
      new AbortController().signal,
    )
    expect(report.steps[0]?.result).toContain('not editable')
    expect(report.steps[1]?.result).toContain('not editable')
    expect(report.steps[2]?.result).toBe('blocked by the owner\'s settings ("支付")')
    expect(report.steps[3]?.result).toBe('blocked by the owner\'s settings ("禁止输入")')
    expect(report.steps[4]?.result).toBe('no element [99] on this screen')
    expect(report.steps[5]?.result).toStartWith('OK')
    // 只有最后的合法搜索框触发动作；前面的拒绝路径连聚焦点击也不能发出。
    expect(f.commands.filter((c) => c.action !== 'observe').map((c) => c.action)).toEqual(['tap', 'type', 'enter'])
  })
  test('输入框聚焦失败后不输入、不提交；省略元素时仍支持当前聚焦输入框', async () => {
    const f = ports(
      [
        '{"action":{"type":"type","element":2,"text":"不要输入","submit":true}}',
        '{"action":{"type":"type","text":"当前输入框"}}',
        '{"action":{"type":"done","summary":"x"}}',
      ],
      (command) => (command.action === 'tap' ? { ok: false, code: 'GESTURE_CANCELLED' } : { ok: true, code: 'OK' }),
    )
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    expect(report.steps[0]?.result).toBe('GESTURE_CANCELLED')
    expect(report.steps[1]?.result).toStartWith('OK')
    const acted = f.commands.filter((c) => c.action !== 'observe')
    expect(acted.map((c) => c.action)).toEqual(['tap', 'type'])
    expect(acted[1]).toEqual({ action: 'type', text: '当前输入框' })
  })
  test('误入禁止的应用：除了返回和回桌面都不执行，提示里说明', async () => {
    const f = ports([
      '{"action":{"type":"scroll"}}',
      '{"action":{"type":"back"}}',
      '{"action":{"type":"done","summary":"x"}}',
    ])
    const inner = f.p.act
    f.p.act = async (command) => {
      if (command.action === 'observe') {
        f.commands.push(command)
        return {
          ok: true,
          code: 'OK',
          data: { ...screenData(), packageName: 'com.android.settings' },
          image: '/9j/2Q==',
        }
      }
      return inner(command)
    }
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    expect(report.steps[0]?.result).toContain('this app is blocked')
    expect(report.steps[1]?.result).toStartWith('OK')
    expect(f.prompts[0]).toContain("This app is blocked by the owner's settings")
  })
})

describe('拖动', () => {
  test('拟人拖动保留端点、七个弯曲途经点，按住与时长在范围内', () => {
    for (const hold of [false, true]) {
      const drag = humanDrag({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, hold, sequence(7))
      if (drag.action !== 'drag') throw new Error('应生成拖动')
      expect([drag.x, drag.y, drag.endX, drag.endY]).toEqual([0.2, 0.5, 0.8, 0.5])
      expect(drag.points).toHaveLength(7)
      expect(drag.points?.[3]?.[1]).not.toBe(0.5)
      expect(drag.hold).toBeGreaterThanOrEqual(hold ? 600 : 40)
      expect(drag.hold).toBeLessThanOrEqual(hold ? 900 : 90)
      expect(drag.duration).toBeGreaterThanOrEqual(hold ? 920 : 650)
      expect(drag.duration).toBeLessThanOrEqual(hold ? 1400 : 1130)
      expect(drag.rest).toBeGreaterThanOrEqual(hold ? 550 : 120)
      expect(drag.rest).toBeLessThanOrEqual(hold ? 900 : 260)
    }
    for (const from of [
      { x: -1, y: 2 },
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]) {
      const drag = humanDrag(from, { x: 2, y: -1 }, false, sequence(9))
      if (drag.action !== 'drag') throw new Error('应生成拖动')
      for (const pair of [[drag.x, drag.y], [drag.endX, drag.endY], ...(drag.points ?? [])])
        for (const coordinate of pair) {
          expect(coordinate).toBeGreaterThanOrEqual(0)
          expect(coordinate).toBeLessThanOrEqual(1)
        }
    }
  })
  test('按住拖在终点至少悬停 550 毫秒，等待启动器让位', () => {
    for (const value of [0, 0.5, 1]) {
      const drag = humanDrag({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, true, () => value)
      if (drag.action !== 'drag') throw new Error('应生成拖动')
      expect(drag.rest).toBeGreaterThanOrEqual(550)
      expect(drag.rest).toBeLessThanOrEqual(900)
      expect(Number.isInteger(drag.rest)).toBe(true)
    }
  })
  test('解析两端的元素、坐标和混合形式，hold 只接受严格 true', () => {
    for (const start of [{ element: 1 }, { x: 0.2, y: 0.5 }])
      for (const end of [{ to_element: 2 }, { to_x: 0.8, to_y: 0.5 }])
        for (const hold of [true, false, undefined, 'true', 1])
          expect(
            parseDecision(JSON.stringify({ action: { type: 'drag', ...start, ...end, hold } })).action,
          ).toMatchObject({ type: 'drag', ...start, ...end, hold: hold === true })
    for (const fields of [{ element: 1 }, { to_element: 2 }, { x: 0.2, to_element: 2 }, { element: 1, to_y: 0.3 }])
      expect(() => parseDecision(JSON.stringify({ action: { type: 'drag', ...fields } }))).toThrow(
        'drag needs "element" or "x" and "y" for the start, and "to_element" or "to_x" and "to_y" for the end',
      )
    expect(systemPrompt(goal())).toContain('Use scroll, not drag')
  })
  test('正常拖动、坐标夹限及步骤描述', async () => {
    const f = ports(
      [
        { type: 'drag', element: 1, to_element: 2, hold: true },
        { type: 'drag', x: 0.2, y: 0.5, to_x: 0.8, to_y: 0.5 },
        { type: 'drag', element: 1, to_x: 0.5, to_y: 0.9, hold: true },
        { type: 'drag', x: -1, y: 2, to_x: 2, to_y: -1 },
      ].map((action) => JSON.stringify({ action })),
    )
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    const drags = f.commands.filter((c) => c.action === 'drag')
    expect(drags).toHaveLength(4)
    expect(drags[0]?.hold).toBeGreaterThanOrEqual(600)
    expect(drags[3]).toMatchObject({ x: 0, y: 1, endX: 1, endY: 0 })
    expect(report.steps.slice(0, 3).map((s) => s.action)).toEqual([
      'hold-drag [1] "推荐" → [2] "搜索"',
      'drag (0.20, 0.50) → (0.80, 0.50)',
      'hold-drag [1] "推荐" → (0.50, 0.90)',
    ])
  })
  test('两端分别检查元素和坐标限制，delete 放开后允许拖入删除区', async () => {
    for (const allowed of [[], ['delete' as const]]) {
      const actions = [
        { type: 'drag', element: 1, to_element: 3 },
        { type: 'drag', x: 0.1, y: 0.075, to_x: 0.5, to_y: 0.85 },
        { type: 'drag', element: 2, to_element: 1 },
        { type: 'drag', x: 0.6, y: 0.075, to_element: 1 },
      ]
      const f = ports(actions.map((action) => JSON.stringify({ action })))
      const inner = f.p.act
      f.p.act = async (command) =>
        command.action === 'observe'
          ? {
              ok: true,
              code: 'OK',
              data: screenData([{ text: '删除', clickable: true, bounds: [0, 1600, 1000, 1800] }]),
            }
          : inner(command)
      const report = await runOperator(
        goal({ policy: { allowed, blockedApps: [], blockedWords: ['搜索'] } }),
        f.p,
        new AbortController().signal,
      )
      for (const index of [0, 1])
        expect(report.steps[index]?.result).toStartWith(
          allowed.length ? 'OK' : 'blocked by the owner\'s settings ("删除")',
        )
      for (const index of [2, 3]) expect(report.steps[index]?.result).toBe('blocked by the owner\'s settings ("搜索")')
      expect(f.commands.filter((c) => c.action === 'drag')).toHaveLength(allowed.length ? 2 : 0)
    }
  })
  test('禁止的应用不执行拖动', async () => {
    const f = ports(['{"action":{"type":"drag","element":1,"to_element":2}}'])
    f.p.act = async (command) => {
      f.commands.push(command)
      return { ok: true, code: 'OK', data: { ...screenData(), packageName: 'com.android.settings' } }
    }
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    expect(report.steps[0]?.result).toContain('this app is blocked')
    expect(f.commands.every((c) => c.action === 'observe')).toBe(true)
  })
  test('不存在的两端元素和旧版 App 的回报', async () => {
    const f = ports(
      [
        '{"action":{"type":"drag","element":99,"to_element":2}}',
        '{"action":{"type":"drag","element":1,"to_element":98}}',
        '{"action":{"type":"drag","element":1,"to_element":2}}',
      ],
      () => ({ ok: false, code: 'UNSUPPORTED_ACTION' }),
    )
    const report = await runOperator(goal(), f.p, new AbortController().signal)
    expect(report.steps.slice(0, 3).map((s) => s.result)).toEqual([
      'no element [99] on this screen',
      'no element [98] on this screen',
      'drag is not supported by this companion app version (needs 0.5.1); try another way',
    ])
    expect(f.commands.filter((c) => c.action === 'drag')).toHaveLength(1)
  })
})
