import { describe, expect, test } from 'bun:test'
import {
  type Goal,
  humanScroll,
  humanTap,
  matchApp,
  type OperatorPorts,
  parseDecision,
  pointIn,
  readScreen,
  runOperator,
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
