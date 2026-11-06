import type { ExtensionContext, ExtensionStorage } from '../../apps/server/src/extensions/types'
import { Bridge } from './bridge'
import { delay, runCommand } from './commands'
import { markScreenshot } from './marks'
import { type EndReason, type Permission, type Policy, type Report, runOperator, type Step } from './operator'
import { profileOf, recordUsage, shouldShare, updateNotes } from './profile'

/** 插件设置（已合并默认值、限定范围） */
export interface PhoneSettings {
  notifyMode: 'off' | 'context' | 'react'
  notifyApps: string
  notifyIgnore: string
  quietHours: string
  diaryTime: string
  timeZone: string
  routine: boolean
  routineWindows: string
  routinePerDay: number
  routineSkip: number
  routineShare: 'worth' | 'always' | 'never'
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
  notifyMode: 'react',
  notifyApps: '',
  notifyIgnore: '',
  quietHours: '',
  diaryTime: '23:30',
  timeZone: 'Asia/Shanghai',
  routine: false,
  routineWindows: '08:30-09:30\n12:30-13:30\n18:30-19:30\n21:30-23:30',
  routinePerDay: 4,
  routineSkip: 0.2,
  routineShare: 'worth',
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
    notifyMode: raw.notifyMode === 'off' || raw.notifyMode === 'context' ? raw.notifyMode : 'react',
    notifyApps: str('notifyApps'),
    notifyIgnore: str('notifyIgnore'),
    quietHours: str('quietHours'),
    diaryTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(str('diaryTime')) ? str('diaryTime') : '23:30',
    timeZone: validTimeZone(str('timeZone')),
    routine: raw.routine === true,
    routineWindows: typeof raw.routineWindows === 'string' ? raw.routineWindows : DEFAULT_SETTINGS.routineWindows,
    routinePerDay: range(raw.routinePerDay, 0, 100, 4),
    routineSkip:
      typeof raw.routineSkip === 'number' && Number.isFinite(raw.routineSkip)
        ? Math.max(0, Math.min(1, raw.routineSkip))
        : 0.2,
    routineShare: raw.routineShare === 'always' || raw.routineShare === 'never' ? raw.routineShare : 'worth',
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

export function validTimeZone(value: string) {
  try {
    if (value) {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return value
    }
  } catch {}
  return 'Asia/Shanghai'
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
  source?: 'routine' | 'notification'
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
export const timing = { scale: 1, now: Date.now, random: Math.random }

const STEPS_KEPT = 40
const MEMORIES_KEPT = 8

/** 正在跑的任务的中止开关。只能放内存；按设备 id 区分用户（每个用户只有一台配对设备）。 */
const running = new Map<string, AbortController>()
const maintenance = new Set<string>()

const deviceId = (storage: ExtensionStorage) => storage.get<{ id: string }>('device')?.id ?? ''

export function currentTask(storage: ExtensionStorage) {
  const task = storage.get<TaskState>('task')
  // 进程重启后内存里的任务没了，存储里还写着 running 的要纠正
  if (task?.status === 'running' && !running.has(deviceId(storage))) return { ...task, status: 'stopped' as const }
  return task ?? null
}

/** 应用列表刷新持有短租约，手机任务不能抢占它。 */
export function reservePhone(storage: ExtensionStorage) {
  const key = deviceId(storage)
  if (!key || running.has(key) || maintenance.has(key)) return null
  maintenance.add(key)
  return () => maintenance.delete(key)
}
export function phoneBusy(storage: ExtensionStorage) {
  return running.has(deviceId(storage)) || maintenance.has(deviceId(storage))
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
    source?: 'routine' | 'notification'
    tracked?: boolean
  },
): Promise<Report> {
  const storage = ctx.storage
  const key = deviceId(storage)
  const settings = settingsOf(ctx.settings)
  if (!key) throw new Error('DEVICE_OFFLINE')
  const active = currentTask(storage)
  if (phoneBusy(storage)) throw new PhoneBusyError(active?.goal ?? 'Phone maintenance')

  const info = ctx.host.getChatInfo(input.chatId, 1)
  const controller = new AbortController()
  // wait 模式跟随工具调用：生成被中止时任务也停
  const abort = () => controller.abort()
  input.signal?.addEventListener('abort', abort, { once: true })
  if (input.signal?.aborted) controller.abort()
  running.set(key, controller)

  const speaker = info.characters.find((c) => c.id === input.speakerId) ?? info.characters[0]
  const persona = [speaker?.personality, speaker?.description].filter(Boolean).join('\n')
  const state: TaskState = {
    id: crypto.randomUUID(),
    chatId: input.chatId,
    goal: input.goal,
    mode: input.mode,
    source: input.source,
    status: 'running',
    startedAt: timing.now(),
    steps: [],
  }
  storage.set('task', state)
  const bridge = new Bridge(storage, timing.now)

  const used = new Set<string>()
  const job = runOperator(
    {
      goal: input.goal,
      name: speaker?.name ?? 'the user',
      persona,
      phoneNotes: profileOf(storage).notes,
      installedApps: profileOf(storage).apps,
      maxSteps: settings.maxSteps,
      maxMs: input.minutes * 60_000,
      policy: policyOf(settings),
    },
    {
      act: async (command) => {
        const result = await runCommand(bridge, command, controller.signal, state.id)
        if (result.ok) {
          const pkg = command.action === 'open' ? command.packageName : result.data?.packageName
          if (typeof pkg === 'string' && pkg && !used.has(pkg)) {
            used.add(pkg)
            recordUsage(storage, pkg, timing.now())
          }
        }
        return result
      },
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
      now: timing.now,
      random: timing.random,
      onStep(step) {
        state.steps = [...state.steps, step].slice(-STEPS_KEPT)
        storage.set('task', state)
      },
    },
    controller.signal,
  )
    .then(async (report) => {
      Object.assign(state, {
        status: report.endReason,
        endedAt: timing.now(),
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
              at: timing.now(),
            },
          ].slice(-MEMORIES_KEPT),
        )
      return report
    })
    .catch((error) => {
      Object.assign(state, {
        status: 'error',
        endedAt: timing.now(),
        summary: error instanceof Error ? error.message : 'FAILED',
      })
      storage.set('task', state)
      throw error
    })
    .finally(() => {
      if (running.get(key) === controller) running.delete(key)
    })

  // 档案笔记的提炼在任务结束后另走一路：不拖慢等结果模式的工具返回，也不占着手机
  const notes = job
    .then((report) =>
      report.endReason === 'stopped' ? undefined : updateNotes(ctx, describeReport(report), controller.signal),
    )
    .catch(() => {})
  const completion = job
    .then(async (report) => {
      if (input.mode === 'background' && (await shouldShare(ctx, input.source, report, controller.signal)))
        await announce(ctx, input.chatId, input.speakerId, report, controller.signal)
      // 后台（定时任务里）要等提炼做完再返回，宿主才能追踪
      if (input.mode === 'background') await notes
      return report
    })
    .finally(() => input.signal?.removeEventListener('abort', abort))
  if (input.mode === 'background' && !input.tracked) completion.catch(() => {})
  return input.mode === 'background' && !input.tracked ? job : completion
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
async function announce(
  ctx: ExtensionContext,
  chatId: string,
  speakerId: string | undefined,
  report: Report,
  signal: AbortSignal,
) {
  if (signal.aborted || report.endReason === 'stopped') return
  const instruction = `[Phone] You just put your phone down. ${describeReport(report)}

Continue the conversation naturally as yourself, like a person who just finished using their phone: mention what you did or found only if it is worth sharing, briefly and casually, in your own voice. Do not start another phone task right now unless the user asks. Write in the same language as the conversation.`
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await ctx.host.waitIdle(chatId, 10 * 60_000)
      if (signal.aborted) return
      ctx.host.trigger(chatId, { ...(speakerId ? { speakerId } : {}), instruction })
      return
    } catch {
      // 用户刚好又在生成，过一会儿再试
      await delay(5000 * timing.scale, signal).catch(() => {})
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
  for (const m of recent.slice(-8)) {
    const ago = Math.round((now - m.at) / 60000)
    const when = ago < 60 ? `${Math.max(1, ago)} min ago` : `${Math.round(ago / 60)} h ago`
    lines.push(`- ${when}, ${m.goal}: ${m.summary}${m.memories.length ? ` Noticed: ${m.memories.join('; ')}` : ''}`)
  }
  if (!lines.length) return ''
  return `[Your recent phone use — your own memories, mention them only when natural]\n${lines.join('\n')}`
}
