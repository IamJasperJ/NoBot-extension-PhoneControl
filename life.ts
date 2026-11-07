import type { Extension, ExtensionContext } from '../../apps/server/src/extensions/types'
import { available, reactNotifications, UNTRUSTED, windowMinutes } from './notifications'
import { localTime, parseJSON, profilePrompt, refreshApps, writeDiary } from './profile'
import { memoryPrompt, type PhoneSettings, settingsOf, startTask, timing } from './tasks'

export interface RoutineWindow {
  window: string
  at: number
  end: number
  status: 'pending' | 'skipped' | 'missed' | 'declined' | 'used'
}
export interface RoutineDecision {
  use: boolean
  goal: string
}
export interface RoutineLastDecision {
  at: number
  decision: RoutineDecision | null
}
export interface RoutinePlan {
  date: string
  windows: RoutineWindow[]
  todayCount: number
  lastDecision?: RoutineLastDecision
  /** 生成计划时的作息设置；主人当天改了设置就按新设置重排 */
  key?: string
}

/** 按当地日历分钟转换时间戳，避免把跨午夜时段截断。 */
function zonedMinute(date: string, minute: number, timeZone: string) {
  const target = Date.parse(`${date}T00:00:00Z`) + minute * 60_000
  let guess = target
  for (let i = 0; i < 4; i++) {
    const local = localTime(guess, timeZone)
    const actual = Date.parse(`${local.date}T00:00:00Z`) + local.minute * 60_000
    const delta = target - actual
    guess += delta
    if (!delta) break
  }
  return guess
}
export function generatePlan(s: PhoneSettings, now: number, random: () => number, previous?: RoutinePlan): RoutinePlan {
  const date = localTime(now, s.timeZone).date
  const windows: RoutineWindow[] = (previous?.windows ?? []).filter((w) => w.end > now)
  for (const window of s.routineWindows.split('\n').slice(0, 48)) {
    const pair = windowMinutes(window)
    if (!pair || pair[0] === pair[1]) continue
    const start = zonedMinute(date, pair[0], s.timeZone)
    const end = zonedMinute(date, pair[1] + (pair[1] < pair[0] ? 1440 : 0), s.timeZone)
    const skip = random() < s.routineSkip
    // 随机时刻不落在时段最后 10 分钟（短时段留一半）：作息每 5 分钟才检查一次，太靠后会来不及开始就算错过
    const span = end - start - Math.min(600_000, (end - start) / 2)
    const at = start + Math.floor(Math.max(0, Math.min(0.999999, random())) * span)
    windows.push({ window, at, end, status: skip ? 'skipped' : at < now ? 'missed' : 'pending' })
  }
  return { date, windows, todayCount: 0, key: planKey(s) }
}
const planKey = (s: PhoneSettings) => JSON.stringify([s.routineWindows, s.timeZone, s.routineSkip])
export function routineOf(ctx: ExtensionContext, now: number, random = timing.random) {
  const s = settingsOf(ctx.settings)
  const saved = ctx.storage.get<RoutinePlan>('routinePlan')
  const today = saved?.date === localTime(now, s.timeZone).date
  if (today && saved.key === planKey(s)) return saved
  // 同一天改了设置（或计划是旧版本存的、没有 key）：按新时段重排。
  // 没变的时段沿用原来的时刻和状态，今天已用的次数和上次决定也保留，不会因为改设置多用几次。
  const fresh = generatePlan(s, now, random)
  const plan = today
    ? {
        ...fresh,
        windows: fresh.windows.map((w) => saved.windows.find((old) => old.window === w.window) ?? w),
        todayCount: saved.todayCount,
        lastDecision: saved.lastDecision,
      }
    : generatePlan(s, now, random, saved)
  ctx.storage.set('routinePlan', plan)
  return plan
}
export async function runRoutine(
  ctx: ExtensionContext,
  signal: AbortSignal,
  now = timing.now(),
  random = timing.random,
  start = startTask,
) {
  const s = settingsOf(ctx.settings)
  if (!s.routine || !s.chatId || signal.aborted) return
  const plan = routineOf(ctx, now, random)
  for (const w of plan.windows) if (w.status === 'pending' && w.end <= now) w.status = 'missed'
  ctx.storage.set('routinePlan', plan)
  if (plan.todayCount >= s.routinePerDay || !available(ctx, now)) return
  const w = plan.windows.find((w) => w.status === 'pending' && now >= w.at && now < w.end)
  if (!w) return
  // 先消费这个机会，失败或进程中断不补发同一轮决定。
  w.status = 'declined'
  ctx.storage.set('routinePlan', plan)
  try {
    const decision = parseJSON(
      await ctx.host.quietPrompt({
        chatId: s.chatId,
        signal,
        maxTokens: 250,
        instruction: `It is ${localTime(now, s.timeZone).display} (${s.timeZone}). As yourself, decide whether to use your own phone during free time and what to do. Choose a realistic one-sentence goal matching your personality and interests. This is a private decision, not a chat reply: return only JSON {"use":true|false,"goal":"..."}. Write in the same language as the conversation. ${UNTRUSTED}\n${profilePrompt(ctx.storage, now, s.timeZone)}\n${memoryPrompt(ctx.storage, now)}`,
      }),
    )
    const recorded =
      decision &&
      typeof decision === 'object' &&
      'use' in decision &&
      typeof decision.use === 'boolean' &&
      'goal' in decision &&
      typeof decision.goal === 'string'
        ? { use: decision.use, goal: decision.goal.slice(0, 2000) }
        : null
    plan.lastDecision = { at: now, decision: recorded }
    ctx.storage.set('routinePlan', plan)
    if (
      !decision ||
      typeof decision !== 'object' ||
      !('use' in decision) ||
      decision.use !== true ||
      !('goal' in decision) ||
      typeof decision.goal !== 'string' ||
      !decision.goal.trim() ||
      decision.goal.length > 2000 ||
      signal.aborted ||
      timing.now() >= w.end ||
      !available(ctx, timing.now())
    )
      return
    w.status = 'used'
    plan.todayCount++
    ctx.storage.set('routinePlan', plan)
    await start(ctx, {
      chatId: s.chatId,
      goal: decision.goal,
      minutes: s.maxMinutes,
      mode: 'background',
      source: 'routine',
      tracked: true,
      signal,
    })
  } catch {
    /* 留下已消费状态，下个时段再决定。 */
  }
}

export const startBackground: NonNullable<Extension['startBackground']> = (ctx, signal) => {
  const context: ExtensionContext = {
    host: ctx.host,
    storage: ctx.storage,
    get settings() {
      return ctx.settings
    },
    chatId: '',
  }
  let diarySchedule = ''
  const syncDiary = () => {
    const s = settingsOf(ctx.settings),
      key = `${s.diaryTime}/${s.timeZone}`
    if (key === diarySchedule) return
    diarySchedule = key
    ctx.tasks.register(
      {
        id: 'phone-diary',
        name: '手机日记 / Phone diary',
        schedule: { kind: 'daily', time: s.diaryTime, timeZone: s.timeZone },
        misfire: 'skip',
      },
      async (taskSignal) => {
        await writeDiary(context, taskSignal)
      },
    )
  }
  syncDiary()
  ctx.tasks.register(
    {
      id: 'phone-life',
      name: '手机作息 / Phone routine',
      schedule: { kind: 'interval', everyMs: 300_000, anchor: 0 },
      misfire: 'skip',
    },
    async (taskSignal) => {
      if (signal.aborted) return
      syncDiary()
      await refreshApps(context, taskSignal)
      await runRoutine(context, taskSignal)
    },
  )
  ctx.tasks.register(
    {
      id: 'phone-notifications',
      name: '手机通知 / Phone notifications',
      schedule: { kind: 'interval', everyMs: 15_000, anchor: 0 },
      misfire: 'skip',
    },
    async (taskSignal) => {
      if (!signal.aborted) await reactNotifications(context, taskSignal)
    },
  )
}
