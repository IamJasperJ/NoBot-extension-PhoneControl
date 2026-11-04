import type { Extension } from '../../apps/server/src/extensions/types'
import { settings } from './host'
import { translate } from './i18n'
import { registerRoutes, registerTaskRoutes } from './routes'
import { DEFAULT_SETTINGS, memoryPrompt, settingsOf, stopAll } from './tasks'
import { phoneTools } from './tools'

const t = (key: string) => translate(settings.getLanguage(), key)

export default {
  id: 'phone-control',
  name: t('手机控制'),
  description: t('通过安卓伴侣连接并控制手机'),
  version: '0.5.0',
  defaultSettings: { ...DEFAULT_SETTINGS },
  settingsSchema: [
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
      const content = memoryPrompt(ctx.storage, Date.now())
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
