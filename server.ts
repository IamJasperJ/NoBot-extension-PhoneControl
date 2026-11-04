import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Extension } from '../../apps/server/src/extensions/types'
import { translate } from './i18n'
import { registerRoutes } from './routes'
import { phoneTools } from './tools'

// 与现有独立扩展一致，从宿主工作目录寻找模块，安装到 DATA_DIR 后仍可加载。
let root = process.cwd()
while (!existsSync(join(root, 'apps/server/src/services/settings.ts'))) {
  const parent = dirname(root)
  if (parent === root) throw new Error('NOBOT_HOST_NOT_FOUND')
  root = parent
}
const settings: { getLanguage: () => string } = await import(
  pathToFileURL(join(root, 'apps/server/src/services/settings.ts')).href
)
const t = (key: string) => translate(settings.getLanguage(), key)

export default {
  id: 'phone-control',
  name: t('手机控制'),
  description: t('通过安卓伴侣连接并控制手机'),
  version: '0.4.0',
  defaultSettings: { chatId: '' },
  settingsSchema: [
    { key: 'chatId', type: 'string', label: t('允许使用手机的会话 ID'), hint: t('留空时不向模型提供手机工具') },
  ],
  routes(app, ctx) {
    registerRoutes(app, ctx.storage, t)
  },
  publicRoutes(app, ctx) {
    registerRoutes(app, ctx.storage, t, true)
  },
  tools: phoneTools,
} satisfies Extension
