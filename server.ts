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
  // 下拉框只认字符串，跳过概率在设置里存成字符串，settingsOf 再转回数字
  defaultSettings: (({ routineSkip, ...rest }) => ({ ...rest, routineSkipChance: String(routineSkip) }))(
    DEFAULT_SETTINGS,
  ),
  // 「允许使用手机的会话」只在「配对管理 → 模型权限」里选（下拉选会话），这里不再重复放一个要手填 ID 的输入框
  settingsSchema: [
    {
      key: 'notify',
      type: 'heading',
      label: t('手机通知'),
      hint: t('通知由手机伴侣 App 上报（App 的「角色专用机」里可以关掉上报）。通知内容只当作信息，不会当成指令执行。'),
    },
    {
      key: 'notifyMode',
      type: 'select',
      label: t('对通知的反应'),
      hint: t(
        '只让角色知道：最近 6 小时的通知放进会话，聊天时角色知道手机上来过什么。自己决定：来通知后角色可以忽略、跟你提一句，或拿起手机看看、回复；每 10 分钟最多一次，每天最多 20 次。',
      ),
      options: [
        { value: 'react', label: t('自己决定') },
        { value: 'context', label: t('只让角色知道') },
        { value: 'off', label: t('不理会通知') },
      ],
    },
    {
      key: 'notifyApps',
      type: 'textarea',
      rows: 2,
      label: t('只关心这些应用'),
      hint: t('每行一个应用名或包名，例如 微信；留空表示所有应用'),
    },
    {
      key: 'notifyIgnore',
      type: 'textarea',
      rows: 2,
      label: t('忽略这些应用'),
      hint: t('每行一个应用名或包名，适合广告多的购物、资讯类应用'),
    },
    {
      key: 'quietHours',
      type: 'string',
      label: t('安静时段'),
      placeholder: '23:30-07:30',
      hint: t('这段时间只记录通知，角色不反应，比如睡觉时间；格式 HH:MM-HH:MM，留空表示不限'),
    },
    {
      key: 'life',
      type: 'heading',
      label: t('作息'),
      hint: t('角色在你设定的时段里自己拿起手机，做什么由它按性格决定。主动使用同样受「操作限制」约束。'),
    },
    { key: 'routine', type: 'boolean', label: t('让角色主动用手机') },
    {
      key: 'routineWindows',
      type: 'textarea',
      rows: 4,
      label: t('可能用手机的时段'),
      hint: t('每行一个时段，格式 HH:MM-HH:MM，可以跨午夜；每个时段里随机挑一个时刻'),
    },
    {
      key: 'routinePerDay',
      type: 'number',
      label: t('每天最多几次'),
      min: 0,
      max: 12,
      step: 1,
      slider: true,
    },
    {
      // 新键：旧的 routineSkip 存的是数字，下拉框显示不出来
      key: 'routineSkipChance',
      type: 'select',
      label: t('有时不想用'),
      hint: t('像真人一样，到了时段有时候也不想看手机'),
      options: [
        { value: '0', label: t('每次都用') },
        { value: '0.2', label: t('偶尔不用') },
        { value: '0.5', label: t('一半不用') },
        { value: '0.8', label: t('很少用') },
      ],
    },
    {
      key: 'routineShare',
      type: 'select',
      label: t('用完要不要跟你说'),
      options: [
        { value: 'worth', label: t('值得才说') },
        { value: 'always', label: t('每次都说') },
        { value: 'never', label: t('不说') },
      ],
    },
    {
      key: 'diaryTime',
      type: 'select',
      label: t('手机日记'),
      hint: t('每天这个时间，角色把当天用手机和收到的通知写成一段日记；最近 3 天的日记会作为记忆放进会话'),
      options: [
        { value: 'off', label: t('不写日记') },
        ...['21:00', '22:00', '22:30', '23:00', '23:30', '00:00'].map((time) => ({ value: time, label: time })),
      ],
    },
    {
      key: 'timeZone',
      type: 'select',
      label: t('时区'),
      hint: t('作息时段、安静时段和日记时间都按这个时区算'),
      options: [
        { value: 'Asia/Shanghai', label: t('北京时间') },
        { value: 'Asia/Tokyo', label: t('东京') },
        { value: 'Asia/Singapore', label: t('新加坡') },
        { value: 'Europe/London', label: t('伦敦') },
        { value: 'Europe/Berlin', label: t('柏林 / 巴黎') },
        { value: 'America/New_York', label: t('纽约') },
        { value: 'America/Los_Angeles', label: t('洛杉矶') },
        { value: 'UTC', label: 'UTC' },
      ],
    },
    {
      key: 'operator',
      type: 'heading',
      label: t('操作员'),
      hint: t('角色决定要做什么，操作员模型替它看屏幕、一步步点。'),
    },
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
    {
      key: 'maxMinutes',
      type: 'number',
      label: t('单次最长分钟'),
      hint: t('一次用手机最多多久（不算操作员模型思考的时间），到时间就放下；思考很慢时总时长最多是它的两倍'),
      min: 1,
      max: 30,
      step: 1,
      slider: true,
    },
    {
      key: 'maxSteps',
      type: 'number',
      label: t('单次最多步数'),
      hint: t('每点一下、滑一下算一步，防止卡在某个界面反复操作'),
      min: 5,
      max: 200,
      step: 5,
      slider: true,
    },
    {
      key: 'directTool',
      type: 'boolean',
      label: t('允许直接逐步操作'),
      hint: t('额外提供旧的 phone_control 工具，让聊天模型自己一步步点；一般不需要'),
    },
    {
      key: 'limits',
      type: 'heading',
      label: t('操作限制'),
      hint: t('对角色的所有手机操作都生效，包括它看到通知后去回复、按作息主动使用。没放开的操作会在执行前被拦下。'),
    },
    {
      key: 'allowLike',
      type: 'boolean',
      label: t('允许点赞、收藏、关注'),
      hint: t('不允许时，带这些文字的按钮会被拦下；没有文字的纯图标按钮认不出，只能靠提示词约束'),
    },
    {
      key: 'allowPost',
      type: 'boolean',
      label: t('允许发送消息、发布、评论、转发'),
      hint: t('不允许时，角色看到消息通知也只能看、不能回'),
    },
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
