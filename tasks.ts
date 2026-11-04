import type { ExtensionContext, ExtensionStorage } from '../../apps/server/src/extensions/types'
import { Bridge } from './bridge'
import { delay, runCommand } from './commands'
import { markScreenshot } from './marks'
import { type EndReason, type Permission, type Policy, type Report, runOperator, type Step } from './operator'

/** 插件设置（已合并默认值、限定范围） */
export interface PhoneSettings {
  chatId: string
  operatorConnectionId: string
  operatorModel: string
  maxSteps: number
  maxMinutes: number
  directTool: boolean
  allowLike: boolean
  allowPost: boolean
  allowPurchase: boolean
  allowDelete: boolean
  allowSystem: boolean
  allowPassword: boolean
  /** 每行一个应用名称或包名 */
  blockedApps: string
  /** 每行一个不许点的按钮文字 */
  blockedWords: string
}

export const DEFAULT_SETTINGS: PhoneSettings = {
  chatId: '',
  operatorConnectionId: '',
  operatorModel: '',
  maxSteps: 60,
  maxMinutes: 8,
  directTool: false,
  allowLike: false,
  allowPost: false,
  allowPurchase: false,
  allowDelete: false,
  allowSystem: false,
  allowPassword: false,
  blockedApps: '',
  blockedWords: '',
}

const range = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback

export function settingsOf(raw: Record<string, unknown>): PhoneSettings {
  const str = (key: keyof PhoneSettings) => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '')
  return {
    chatId: str('chatId'),
    operatorConnectionId: str('operatorConnectionId'),
    operatorModel: str('operatorModel'),
    maxSteps: range(raw.maxSteps, 5, 200, DEFAULT_SETTINGS.maxSteps),
    maxMinutes: range(raw.maxMinutes, 1, 30, DEFAULT_SETTINGS.maxMinutes),
    directTool: raw.directTool === true,
    allowLike: raw.allowLike === true,
    allowPost: raw.allowPost === true,
    allowPurchase: raw.allowPurchase === true,
    allowDelete: raw.allowDelete === true,
    allowSystem: raw.allowSystem === true,
    allowPassword: raw.allowPassword === true,
    blockedApps: typeof raw.blockedApps === 'string' ? raw.blockedApps : '',
    blockedWords: typeof raw.blockedWords === 'string' ? raw.blockedWords : '',
  }
}

const lines = (text: string) =>
  text
    .split(/[\n,，]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 100)

/** 设置 → 操作员的限制策略 */
export function policyOf(settings: PhoneSettings): Policy {
  const allowed: Permission[] = []
  if (settings.allowLike) allowed.push('like')
  if (settings.allowPost) allowed.push('post')
  if (settings.allowPurchase) allowed.push('purchase')
  if (settings.allowDelete) allowed.push('delete')
  if (settings.allowSystem) allowed.push('system')
  if (settings.allowPassword) allowed.push('password')
  return { allowed, blockedApps: lines(settings.blockedApps), blockedWords: lines(settings.blockedWords) }
}

/** 界面上显示的任务状态（存进扩展存储，路由和工具共用） */
export interface TaskState {
  id: string
  chatId: string
  goal: string
  mode: 'wait' | 'background'
  status: 'running' | EndReason
  startedAt: number
  endedAt?: number
  steps: Step[]
  summary?: string
  memories?: string[]
}

/** 保留给角色当作记忆的最近几次手机使用 */
export interface Memory {
  goal: string
  summary: string
  memories: string[]
  endReason: EndReason
  at: number
}

/** 等待时长倍率：测试里设成 0，跳过拟人停顿 */
export const timing = { scale: 1 }

const STEPS_KEPT = 40
const MEMORIES_KEPT = 8

/** 正在跑的任务的中止开关。只能放内存；按设备 id 区分用户（每个用户只有一台配对设备）。 */
const running = new Map<string, AbortController>()

const deviceId = (storage: ExtensionStorage) => storage.get<{ id: string }>('device')?.id ?? ''

export function currentTask(storage: ExtensionStorage) {
  const task = storage.get<TaskState>('task')
  // 进程重启后内存里的任务没了，存储里还写着 running 的要纠正
  if (task?.status === 'running' && !running.has(deviceId(storage))) return { ...task, status: 'stopped' as const }
  return task ?? null
}

export function stopTask(storage: ExtensionStorage) {
  running.get(deviceId(storage))?.abort()
}

/** 插件停用 / 重载时中止所有任务 */
export function stopAll() {
  for (const controller of running.values()) controller.abort()
  running.clear()
}

export function recentMemories(storage: ExtensionStorage) {
  return storage.get<Memory[]>('memories') ?? []
}

export class PhoneBusyError extends Error {
  constructor(readonly goal: string) {
    super('PHONE_BUSY')
  }
}

/**
 * 启动一次手机任务。wait 模式下等它跑完再返回；background 模式立即返回，跑完后让角色主动说一句。
 * 同一时间只能有一个任务。
 */
export function startTask(
  ctx: ExtensionContext,
  input: {
    chatId: string
    speakerId?: string
    goal: string
    minutes: number
    mode: 'wait' | 'background'
    signal?: AbortSignal
  },
): Promise<Report> {
  const storage = ctx.storage
  const key = deviceId(storage)
  const settings = settingsOf(ctx.settings)
  if (!key) throw new Error('DEVICE_OFFLINE')
  const active = currentTask(storage)
  if (active?.status === 'running') throw new PhoneBusyError(active.goal)

  const controller = new AbortController()
  // wait 模式跟随工具调用：生成被中止时任务也停
  input.signal?.addEventListener('abort', () => controller.abort(), { once: true })
  running.set(key, controller)

  const info = ctx.host.getChatInfo(input.chatId, 1)
  const speaker = info.characters.find((c) => c.id === input.speakerId) ?? info.characters[0]
  const persona = [speaker?.personality, speaker?.description].filter(Boolean).join('\n')
  const state: TaskState = {
    id: crypto.randomUUID(),
    chatId: input.chatId,
    goal: input.goal,
    mode: input.mode,
    status: 'running',
    startedAt: Date.now(),
    steps: [],
  }
  storage.set('task', state)
  const bridge = new Bridge(storage)

  const job = runOperator(
    {
      goal: input.goal,
      name: speaker?.name ?? 'the user',
      persona,
      maxSteps: settings.maxSteps,
      maxMs: input.minutes * 60_000,
      policy: policyOf(settings),
    },
    {
      act: (command) => runCommand(bridge, command, controller.signal),
      think: (messages, image) =>
        ctx.host.complete({
          chatId: input.chatId,
          messages,
          avatar: image,
          summary: `phone: ${input.goal.slice(0, 40)}`,
          ...(settings.operatorConnectionId ? { connectionId: settings.operatorConnectionId } : {}),
          ...(settings.operatorModel ? { model: settings.operatorModel } : {}),
          maxTokens: 600,
          signal: controller.signal,
        }),
      mark: markScreenshot,
      sleep: (ms) => delay(ms * timing.scale, controller.signal),
      now: Date.now,
      random: Math.random,
      onStep(step) {
        state.steps = [...state.steps, step].slice(-STEPS_KEPT)
        storage.set('task', state)
      },
    },
    controller.signal,
  )
    .then((report) => {
      Object.assign(state, {
        status: report.endReason,
        endedAt: Date.now(),
        summary: report.summary,
        memories: report.memories,
      })
      storage.set('task', state)
      if (report.summary || report.memories.length)
        storage.set(
          'memories',
          [
            ...recentMemories(storage),
            {
              goal: report.goal,
              summary: report.summary,
              memories: report.memories,
              endReason: report.endReason,
              at: Date.now(),
            },
          ].slice(-MEMORIES_KEPT),
        )
      return report
    })
    .catch((error) => {
      Object.assign(state, {
        status: 'error',
        endedAt: Date.now(),
        summary: error instanceof Error ? error.message : 'FAILED',
      })
      storage.set('task', state)
      throw error
    })
    .finally(() => {
      if (running.get(key) === controller) running.delete(key)
    })

  if (input.mode === 'background')
    job
      .then((report) => announce(ctx, input.chatId, input.speakerId, report))
      .catch((error) =>
        ctx.host.log({
          chatId: input.chatId,
          kind: 'extension',
          status: 'error',
          summary: 'phone task failed',
          response: { error: error instanceof Error ? error.message : String(error) },
        }),
      )
  return job
}

const END_TEXT: Record<EndReason, string> = {
  done: 'finished',
  gave_up: 'gave up',
  time: 'reached the time limit',
  steps: 'reached the step limit',
  stopped: 'was stopped by the user',
  error: 'failed',
}

/** 给角色模型看的任务结果（英文；内容本身按目标的语言） */
export function describeReport(report: Report) {
  return [
    `Phone task ${END_TEXT[report.endReason]} after ${report.steps.length} steps, about ${Math.max(1, Math.round(report.durationMs / 60000))} min.`,
    `Goal: ${report.goal}`,
    report.summary ? `What happened: ${report.summary}` : '',
    report.memories.length ? `Things you noticed:\n${report.memories.map((m) => `- ${m}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** 后台任务结束：等会话空闲后让角色主动开口（这条指令只用一次，不入库） */
async function announce(ctx: ExtensionContext, chatId: string, speakerId: string | undefined, report: Report) {
  if (report.endReason === 'stopped') return
  const instruction = `[Phone] You just put your phone down. ${describeReport(report)}

Continue the conversation naturally as yourself, like a person who just finished using their phone: mention what you did or found only if it is worth sharing, briefly and casually, in your own voice. Do not start another phone task right now unless the user asks. Write in the same language as the conversation.`
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await ctx.host.waitIdle(chatId, 10 * 60_000)
      ctx.host.trigger(chatId, { ...(speakerId ? { speakerId } : {}), instruction })
      return
    } catch {
      // 用户刚好又在生成，过一会儿再试
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

/** 注入给绑定会话的近期手机记忆（英文提示） */
export function memoryPrompt(storage: ExtensionStorage, now: number) {
  const lines: string[] = []
  const task = currentTask(storage)
  if (task?.status === 'running')
    lines.push(
      `Right now you are using your phone: ${task.goal} (started ${Math.max(1, Math.round((now - task.startedAt) / 60000))} min ago).`,
    )
  const recent = recentMemories(storage).filter((m) => now - m.at < 24 * 3600_000)
  for (const m of recent.slice(-5)) {
    const ago = Math.round((now - m.at) / 60000)
    const when = ago < 60 ? `${Math.max(1, ago)} min ago` : `${Math.round(ago / 60)} h ago`
    lines.push(`- ${when}, ${m.goal}: ${m.summary}${m.memories.length ? ` Noticed: ${m.memories.join('; ')}` : ''}`)
  }
  if (!lines.length) return ''
  return `[Your recent phone use — your own memories, mention them only when natural]\n${lines.join('\n')}`
}
