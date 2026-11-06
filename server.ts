import type { Extension } from '../../apps/server/src/extensions/types'
import { settings } from './host'
import { translate } from './i18n'
import { startBackground } from './life'
import { notificationPrompt } from './notifications'
import { profilePrompt } from './profile'
import { registerRoutes, registerTaskRoutes } from './routes'
import { DEFAULT_SETTINGS, memoryPrompt, settingsOf, stopAll, timing } from './tasks'
import { phoneTools } from './tools'

const t = (key: string) => translate(settings.getLanguage(), key)

export default {
  id: 'phone-control',
  name: t('手机控制'),
  description: t('通过安卓伴侣连接并控制手机'),
  version: '0.7.0',
  startBackground,
  defaultSettings: { ...DEFAULT_SETTINGS },
  settingsSchema: [
    { key: 'notify', type: 'heading', label: t('手机通知') },
    {
      key: 'notifyMode',
      type: 'select',
      label: t('通知反应'),
      options: [
        { value: 'off', label: t('关闭') },
        { value: 'context', label: t('仅上下文') },
        { value: 'react', label: t('自主反应') },
      ],
    },
    { key: 'notifyApps', type: 'textarea', label: t('只关心这些应用'), hint: t('每行一个应用名或包名，留空表示全部') },
    { key: 'notifyIgnore', type: 'textarea', label: t('忽略这些应用'), hint: t('每行一个应用名或包名') },
    { key: 'quietHours', type: 'string', label: t('安静时段'), hint: t('例如 23:30-07:30，留空表示不限') },
    { key: 'life', type: 'heading', label: t('作息') },
    { key: 'routine', type: 'boolean', label: t('启用主动使用') },
    { key: 'routineWindows', type: 'textarea', label: t('主动使用时段'), hint: t('每行 HH:MM-HH:MM，可以跨午夜') },
    { key: 'routinePerDay', type: 'number', label: t('每天最多主动使用次数'), min: 0, max: 100, step: 1 },
    { key: 'routineSkip', type: 'number', label: t('每个时段跳过概率'), min: 0, max: 1, step: 0.05 },
    {
      key: 'routineShare',
      type: 'select',
      label: t('主动使用后分享'),
      options: [
        { value: 'worth', label: t('值得才说') },
        { value: 'always', label: t('总是分享') },
        { value: 'never', label: t('从不分享') },
      ],
    },
    { key: 'diaryTime', type: 'string', label: t('日记时间'), hint: t('当地时间 HH:MM') },
    { key: 'timeZone', type: 'string', label: t('时区'), hint: t('IANA 时区，非法值回退 Asia/Shanghai') },
    { key: 'chatId', type: 'string', label: t('允许使用手机的会话 ID'), hint: t('留空时不向模型提供手机工具') },
    { key: 'operator', type: 'heading', label: t('操作员') },
    {
      key: 'operatorConnectionId',
      type: 'select',
      label: t('操作员连接'),
      hint: t('替角色一步步操作手机的模型，需要能看图；留空时跟随会话'),
      options: [{ value: '', label: t('跟随会话') }],
      optionsSource: 'connections',
    },
    {
      key: 'operatorModel',
      type: 'string',
      label: t('操作员模型'),
      hint: t('留空时用连接的默认模型；快一点的看图模型更像真人的节奏'),
      optionsSource: 'models',
    },
    { key: 'maxMinutes', type: 'number', label: t('单次最长分钟'), min: 1, max: 30, step: 1, slider: true },
    { key: 'maxSteps', type: 'number', label: t('单次最多步数'), min: 5, max: 200, step: 5 },
    { key: 'limits', type: 'heading', label: t('操作限制') },
    {
      key: 'allowLike',
      type: 'boolean',
      label: t('允许点赞、收藏、关注'),
      hint: t('不允许时，带这些文字的按钮会被拦下；没有文字的纯图标按钮认不出，只能靠提示词约束'),
    },
    { key: 'allowPost', type: 'boolean', label: t('允许发送消息、发布、评论、转发') },
    { key: 'allowPurchase', type: 'boolean', label: t('允许购买、付款、充值、转账'), hint: t('建议保持关闭') },
    { key: 'allowDelete', type: 'boolean', label: t('允许删除、卸载') },
    { key: 'allowPassword', type: 'boolean', label: t('允许输入密码、支付码与验证码'), hint: t('建议保持关闭') },
    { key: 'allowSystem', type: 'boolean', label: t('允许修改系统设置'), hint: t('不允许时也不会打开「设置」应用') },
    {
      key: 'blockedApps',
      type: 'textarea',
      rows: 3,
      label: t('禁止打开的应用'),
      hint: t('每行一个应用名称或包名，比如支付宝；误入这些应用时只能返回或回桌面'),
    },
    {
      key: 'blockedWords',
      type: 'textarea',
      rows: 2,
      label: t('额外拦截的按钮文字'),
      hint: t('每行一个，按钮文字包含它时不点'),
    },
    {
      key: 'directTool',
      type: 'boolean',
      label: t('允许直接逐步操作'),
      hint: t('额外提供旧的 phone_control 工具，让聊天模型自己一步步点；一般不需要'),
    },
  ],
  routes(app, ctx) {
    registerTaskRoutes(app, ctx, t)
    registerRoutes(app, ctx.storage, t)
  },
  publicRoutes(app, ctx) {
    registerRoutes(app, ctx.storage, t, true)
  },
  tools: phoneTools,
  hooks: {
    // 绑定会话里注入近期的手机使用记忆，角色之后聊天能接得上「刚才刷到的」
    beforePrompt(input, ctx) {
      if (!ctx.chatId || ctx.chatId !== settingsOf(ctx.settings).chatId) return input
      const now = timing.now(),
        s = settingsOf(ctx.settings)
      const content = [
        memoryPrompt(ctx.storage, now),
        notificationPrompt(ctx.storage, s, now),
        profilePrompt(ctx.storage, now, s.timeZone),
      ]
        .filter(Boolean)
        .join('\n\n')
      if (!content) return input
      return {
        ...input,
        injections: [
          ...(input.injections ?? []),
          { id: 'phone-control-memory', label: 'Phone', content, position: 'after_char', role: 'system' },
        ],
      }
    },
  },
  dispose: stopAll,
} satisfies Extension
