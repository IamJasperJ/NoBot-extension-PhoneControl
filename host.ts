import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 宿主模块。插件安装在 DATA_DIR/users/<handle>/extensions/ 下，不能用相对路径引用宿主源码，
 * 所以和其他外置扩展一样，从工作目录往上找到 NoBot 源码再按绝对路径加载。
 */
let root = process.cwd()
while (!existsSync(join(root, 'apps/server/src/services/settings.ts'))) {
  const parent = dirname(root)
  if (parent === root) throw new Error('NOBOT_HOST_NOT_FOUND')
  root = parent
}
const load = <T>(path: string): Promise<T> => import(pathToFileURL(join(root, path)).href)

export const settings = await load<{ getLanguage: () => string }>('apps/server/src/services/settings.ts')
interface Connections {
  listApiPresets: () => { id: string; name: string; isDefault: boolean; vision: 'auto' | 'yes' | 'no' }[]
  connectionModels: (id: string) => Promise<{ models: string[] }>
}
/** 连接列表只在设置表单里用到，用时再加载 */
export const connections = () => load<Connections>('apps/server/src/services/connections.ts')

// require 拿到的是 CommonJS 导出的函数本身，对应类型里的 default
type Sharp = typeof import('../../apps/server/node_modules/sharp').default
let sharp: Sharp | null | undefined
/** 宿主自带的 sharp（图像处理）；找不到时返回 null，截图就不画编号 */
export function loadSharp(): Sharp | null {
  if (sharp === undefined) {
    try {
      sharp = createRequire(join(root, 'apps/server/package.json'))('sharp') as Sharp
    } catch {
      sharp = null
    }
  }
  return sharp
}
