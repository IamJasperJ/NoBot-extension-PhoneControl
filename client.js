// @ts-check
// 外置扩展使用宿主 React；翻译随插件分发，避免依赖安装位置之外的运行时模块。
/** @type {Record<string, string>} */
export const en = {
  配对管理: 'Pairing',
  手机控制: 'Phone Control',
  '用 NoBot 手机伴侣扫码连接安卓手机，角色就能看屏幕、点按和输入。':
    'Scan with the NoBot Phone Companion to connect an Android phone so characters can see the screen, tap and type.',
  未配对: 'Not paired',
  已连接: 'Connected',
  未就绪: 'Not ready',
  离线: 'Offline',
  正在读取: 'Loading',
  状态读取失败: 'Unable to read status',
  刷新: 'Refresh',
  最近断线: 'Recent disconnects',
  'App 被系统冻结': 'App frozen by the system',
  网络连不上服务器: 'Could not reach the server',
  'App 或无障碍服务重启过': 'App or accessibility service restarted',
  手动暂停: 'Paused manually',
  原因未知: 'Unknown cause',
  '{minutes} 分钟': '{minutes} min',
  '经常显示「被系统冻结」时，在手机设置里允许 NoBot Phone 后台高耗电、自启动，并在多任务里锁定它。':
    'If it is often frozen by the system, allow NoBot Phone to run in the background without restrictions and auto-start, and lock it in recent apps.',
  生成配对信息: 'Generate pairing code',
  重新配对: 'Pair again',
  撤销授权: 'Revoke access',
  '重新配对会立即使旧密钥失效，并清除当前指令。':
    'Pairing again immediately invalidates the old token and clears the current command.',
  '撤销后，这台手机将无法继续接收指令。已经发生的操作无法撤回。':
    'After revocation, this phone cannot receive further commands. Actions already performed cannot be undone.',
  确认重新配对: 'Confirm new pairing',
  确认撤销: 'Confirm revocation',
  取消: 'Cancel',
  正在处理: 'Working',
  手机入口: 'Phone endpoint',
  设备ID: 'Device ID',
  配对密钥: 'Pairing token',
  复制: 'Copy',
  已复制: 'Copied',
  '复制失败，请手动选择并复制字段内容。': 'Copy failed. Select and copy the field manually.',
  配对: 'Pairing',
  连接状态: 'Connection',
  状态: 'Status',
  上次连接: 'Last contact',
  尚未连接: 'Never connected',
  当前指令: 'Current command',
  无: 'None',
  等待交付: 'Queued',
  已交付: 'Delivered',
  已完成: 'Completed',
  已取消: 'Cancelled',
  已过期: 'Expired',
  请求失败: 'Request failed',
  '还没有配对手机。生成配对码后，用手机伴侣 App 扫一扫即可填好全部参数。':
    'No phone paired yet. Generate a pairing code, then scan it with the companion app to fill in everything.',
  '已配对。服务器不保存可回显的密钥；换手机或重装 App 时请重新配对。':
    'Paired. The server keeps no retrievable token; pair again when switching phones or reinstalling the app.',
  '手机已连接。配对码仍可再次显示，离开本页后失效。':
    'Phone connected. The code can still be shown again; it is cleared when you leave this page.',
  '用手机伴侣点「扫码配对」，或用系统相机扫描后选择用 NoBot 打开。':
    'In the companion app tap “Scan pairing code”, or scan with the system camera and open with NoBot.',
  '二维码含有配对密钥，只在本次页面中显示，离开后无法再次查看。':
    'The code contains the pairing token and is shown only on this page visit.',
  显示二维码: 'Show code',
  隐藏二维码: 'Hide code',
  再次显示二维码: 'Show code again',
  复制配对链接: 'Copy pairing link',
  手动填写: 'Enter manually',
  '入口地址有误，修正后才能生成二维码。': 'Fix the endpoint before the code can be generated.',
  恢复默认: 'Reset',
  可用地址: 'Addresses',
  '手机通过这个地址连接 NoBot，必须是手机能访问到的地址。':
    'The phone connects to NoBot through this address, so it must be reachable from the phone.',
  '地址格式不对，应为 http(s)://主机/hooks/phone-control/账号。':
    'Invalid address. Expected http(s)://host/hooks/phone-control/account.',
  '路径必须以 /hooks/phone-control/{handle} 结尾。': 'The path must end with /hooks/phone-control/{handle}.',
  'localhost 只在本机有效，请换成电脑的内网或 VPN 地址。':
    'localhost only works on this computer. Use its LAN or VPN address instead.',
  '公网地址必须使用 HTTPS；HTTP 只能用于内网或 VPN 地址。':
    'Public addresses must use HTTPS; HTTP is only for LAN or VPN addresses.',
  'HTTP 不加密，只在内网或 VPN 中使用。': 'HTTP is not encrypted. Use it only on a LAN or VPN.',
  '手机连接时会检查这个域名，只有解析到内网或 VPN 地址才会用 HTTP 连接。':
    'The phone checks this hostname when connecting and uses HTTP only if it resolves to a LAN or VPN address.',
  模型权限: 'Model access',
  允许控制手机的会话: 'Chat allowed to control the phone',
  不允许任何会话: 'No chat',
  '这个会话开启工具调用后，角色可以使用 phone_control 工具。主模型需要支持看图。':
    'With tool calls enabled in this chat, the character can use the phone_control tool. The main model should support images.',
  '当前绑定的会话已不存在：{id}': 'The bound chat no longer exists: {id}',
  使用当前会话: 'Use current chat',
  保存: 'Save',
  已保存: 'Saved',
  手机端准备: 'On the phone',
  '安装 NoBot 手机伴侣（Android 11 及以上），扫码或粘贴配对链接并确认。':
    'Install the NoBot Phone Companion (Android 11+), then scan the code or paste the pairing link and confirm.',
  '点「打开无障碍设置」，手动开启 NoBot 手机伴侣。':
    'Tap “Open accessibility settings” and enable NoBot Phone Companion.',
  '回到 App 点「开始接受指令」，再回到桌面；本页状态每三秒刷新。':
    'Return to the app, tap “Start accepting commands”, then go to the home screen. This page refreshes every three seconds.',
  '熄屏也要用：在 App 里点「关闭电池优化」并允许后台运行；锁屏不能设密码，或开启 Smart Lock 让手机在可信场景保持解锁。想全程黑屏操作，在 App 里选「只关屏幕面板」（需要 Shizuku 或 Root）。':
    'To use it with the screen off, tap “Turn off battery optimisation” in the app and allow background running. Use no lock screen password, or enable Smart Lock so the phone stays unlocked in trusted situations. To operate with a black screen throughout, choose “Panel off only” in the app (needs Shizuku or root).',
  手机任务: 'Phone task',
  '角色在绑定会话里使用手机时，这里会实时显示过程。':
    'When the character uses the phone in the bound chat, the progress shows up here live.',
  停止: 'Stop',
  进行中: 'Running',
  放弃了: 'Gave up',
  出错了: 'Failed',
  到时间了: 'Time limit',
  到步数上限: 'Step limit',
  已停止: 'Stopped',
  '{mode} · {count} 步 · {minutes} 分钟': '{mode} · {count} steps · {minutes} min',
  等结果: 'Waiting',
  后台: 'Background',
  记下的: 'Noted',
  配对成功: 'Pairing code generated',
  已撤销授权: 'Access revoked',
}
/** @param {string} key @param {Record<string, string>} [vars] */
function t(key, vars) {
  const text = document.documentElement.lang.startsWith('en') ? (en[key] ?? key) : key
  return vars ? text.replace(/\{(\w+)\}/g, (all, name) => vars[name] ?? all) : text
}

// ───────── 二维码 ─────────
// 只需要字节模式 + M 级纠错；按 ISO/IEC 18004 实现，算法结构参考 Nayuki 的 QR Code generator（MIT）。
// 宿主不提供打包，也不允许为一个页面加 npm 依赖，所以写在这里。

/** M 级纠错每块的纠错码字数，下标是版本号 */
const ECC_PER_BLOCK = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
]
/** M 级纠错的分块数 */
const ECC_BLOCKS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33,
  35, 37, 38, 40, 43, 45, 47, 49,
]
/** 下标都在范围内，只为满足 noUncheckedIndexedAccess @param {ArrayLike<number>} list @param {number} i */
const nth = (list, i) => list[i] ?? 0

/** @param {number} version */
function rawModules(version) {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (version >= 7) result -= 36
  }
  return result
}
/** @param {number} version */
const dataCodewords = (version) =>
  Math.floor(rawModules(version) / 8) - nth(ECC_PER_BLOCK, version) * nth(ECC_BLOCKS, version)

/** GF(2^8) 乘法，本原多项式 0x11D @param {number} x @param {number} y */
function gfMul(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}
/** Reed-Solomon 生成多项式（最高次项省略） @param {number} degree */
function rsDivisor(degree) {
  const result = new Uint8Array(degree)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) result[j] = gfMul(nth(result, j), root) ^ (j + 1 < degree ? nth(result, j + 1) : 0)
    root = gfMul(root, 0x02)
  }
  return result
}
/** @param {number[]} data @param {Uint8Array} divisor @returns {number[]} */
function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length)
  for (const byte of data) {
    const factor = byte ^ nth(result, 0)
    result.copyWithin(0, 1)
    result[result.length - 1] = 0
    for (let i = 0; i < divisor.length; i++) result[i] = nth(result, i) ^ gfMul(nth(divisor, i), factor)
  }
  return [...result]
}

/** @param {number} version */
function alignmentPositions(version) {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2
  const result = [6]
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos)
  return result
}

/** 掩码评分（越低越好） @param {Uint8Array} m 扁平矩阵 @param {number} size */
function penalty(m, size) {
  const at = (/** @type {number} */ x, /** @type {number} */ y) => nth(m, y * size + x)
  let score = 0
  /** @param {(i: number) => number} get */
  const line = (get) => {
    let run = 1
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++
      else {
        if (run >= 5) score += run - 2
        run = 1
      }
    }
    // 1:1:3:1:1 的类定位图案，两侧任一边有 4 个浅色模块
    const light = (/** @type {number} */ from) =>
      [0, 1, 2, 3].every((k) => from + k < 0 || from + k >= size || !get(from + k))
    for (let i = 0; i + 7 <= size; i++)
      if (get(i) && !get(i + 1) && get(i + 2) && get(i + 3) && get(i + 4) && !get(i + 5) && get(i + 6))
        if (light(i - 4) || light(i + 7)) score += 40
  }
  for (let y = 0; y < size; y++) line((x) => at(x, y))
  for (let x = 0; x < size; x++) line((y) => at(x, y))
  let dark = 0
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = at(x, y)
      dark += c
      if (x + 1 < size && y + 1 < size && c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3
    }
  const total = size * size
  return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
}

/** 8 种掩码条件，结果为 0 时翻转 */
const MASKS = [
  (/** @type {number} */ x, /** @type {number} */ y) => (x + y) % 2,
  (/** @type {number} */ _x, /** @type {number} */ y) => y % 2,
  (/** @type {number} */ x) => x % 3,
  (/** @type {number} */ x, /** @type {number} */ y) => (x + y) % 3,
  (/** @type {number} */ x, /** @type {number} */ y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2,
  (/** @type {number} */ x, /** @type {number} */ y) => ((x * y) % 2) + ((x * y) % 3),
  (/** @type {number} */ x, /** @type {number} */ y) => (((x * y) % 2) + ((x * y) % 3)) % 2,
  (/** @type {number} */ x, /** @type {number} */ y) => (((x + y) % 2) + ((x * y) % 3)) % 2,
]

/**
 * 把文字编码成二维码矩阵（字节模式、M 级纠错、自动选最小版本和最佳掩码）。
 * @param {string} text
 * @returns {boolean[][]} modules[y][x]，true 为深色；不含静区
 */
export function encodeQr(text) {
  const bytes = [...new TextEncoder().encode(text)]
  let version = 1
  for (; ; version++) {
    if (version > 40) throw new Error('QR_TOO_LONG')
    if (4 + (version <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(version) * 8) break
  }
  // 数据位：模式 0100 + 长度 + 内容 + 终止符，补齐到字节后用 0xEC / 0x11 填满
  /** @type {number[]} */
  const bits = []
  /** @param {number} value @param {number} length */
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  const capacity = dataCodewords(version) * 8
  push(4, 4)
  push(bytes.length, version <= 9 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8)
  /** @type {number[]} */
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  // 分块加纠错码再交错；短块补一个占位字节，交错时跳过
  const blocks = nth(ECC_BLOCKS, version)
  const eccLength = nth(ECC_PER_BLOCK, version)
  const raw = Math.floor(rawModules(version) / 8)
  const shortBlocks = blocks - (raw % blocks)
  const shortLength = Math.floor(raw / blocks)
  const divisor = rsDivisor(eccLength)
  /** @type {number[][]} */
  const groups = []
  for (let i = 0, k = 0; i < blocks; i++) {
    const chunk = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1))
    k += chunk.length
    const ecc = rsRemainder(chunk, divisor)
    if (i < shortBlocks) chunk.push(0)
    groups.push(chunk.concat(ecc))
  }
  /** @type {number[]} */
  const codewords = []
  for (let i = 0; i <= shortLength; i++)
    for (let j = 0; j < groups.length; j++)
      if (i !== shortLength - eccLength || j >= shortBlocks) codewords.push(nth(groups[j] ?? [], i))

  // 功能图形
  const size = version * 4 + 17
  const modules = new Uint8Array(size * size)
  const fixed = new Uint8Array(size * size)
  /** @param {number} x @param {number} y @param {boolean} dark */
  const set = (x, y, dark) => {
    modules[y * size + x] = dark ? 1 : 0
    fixed[y * size + x] = 1
  }
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of /** @type {[number, number][]} */ ([
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]))
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx,
          y = cy + dy
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4)
      }
  const align = alignmentPositions(version)
  const last = align.length - 1
  for (let i = 0; i <= last; i++)
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(nth(align, i) + dx, nth(align, j) + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  /** 格式信息：M 级纠错的两位是 00，后接 3 位掩码 @param {number} mask */
  const formatBits = (mask) => {
    let rem = mask
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const value = ((mask << 10) | rem) ^ 0x5412
    const bit = (/** @type {number} */ i) => ((value >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6))
    set(8, 8, bit(7))
    set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  formatBits(0)
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const value = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const dark = ((value >>> i) & 1) === 1
      const a = size - 11 + (i % 3),
        b = Math.floor(i / 3)
      set(a, b, dark)
      set(b, a, dark)
    }
  }

  // 之字形写入数据
  let index = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
        if (!fixed[y * size + x] && index < codewords.length * 8) {
          modules[y * size + x] = (nth(codewords, index >>> 3) >>> (7 - (index & 7))) & 1
          index++
        }
      }
  }

  /** 异或两次还原，所以试掩码和最终应用用同一个函数 @param {number} mask */
  const apply = (mask) => {
    const test = MASKS[mask] ?? MASKS[0]
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!fixed[y * size + x] && test?.(x, y) === 0) modules[y * size + x] = nth(modules, y * size + x) ^ 1
  }
  let best = 0,
    bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask++) {
    apply(mask)
    formatBits(mask)
    const score = penalty(modules, size)
    if (score < bestScore) {
      best = mask
      bestScore = score
    }
    apply(mask)
  }
  apply(best)
  formatBits(best)
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => modules[y * size + x] === 1))
}

/**
 * 二维码的 SVG path（每个深色模块一个 1×1 方块），viewBox 为 0 0 size+2·border size+2·border。
 * @param {boolean[][]} modules @param {number} [border] 静区宽度，标准是 4
 */
export function qrPath(modules, border = 4) {
  let d = ''
  for (const [y, row] of modules.entries())
    for (const [x, dark] of row.entries()) if (dark) d += `M${x + border},${y + border}h1v1h-1z`
  return d
}

// ───────── 手机入口 ─────────

/** @param {string} handle */
const hookPath = (handle) => `/hooks/phone-control/${encodeURIComponent(handle)}`
/** @param {string} origin @param {string} handle */
export const defaultEndpoint = (origin, handle) => `${origin}${hookPath(handle)}`
/** @param {string} value */
export const normalizeEndpoint = (value) => value.trim().replace(/\/+$/, '')

/**
 * 主机是否属于内网 / VPN，与安卓端 Endpoint.isPrivate 一致；域名返回 null（只有手机解析后才知道）。
 * @param {string} hostname URL.hostname（IPv6 带方括号）
 * @returns {boolean|null}
 */
export function privateHost(hostname) {
  const v4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const a = Number(v4[1] ?? -1),
      b = Number(v4[2] ?? -1)
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254)
    )
  }
  if (!hostname.startsWith('[')) return null
  const v6 = hostname.slice(1, -1).toLowerCase()
  // URL 会把 ::ffff:192.168.1.1 规范成 ::ffff:c0a8:101
  const mapped = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mapped) {
    const high = Number.parseInt(mapped[1] ?? '', 16),
      low = Number.parseInt(mapped[2] ?? '', 16)
    return privateHost(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  return v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
}

/** @param {string} hostname */
const loopback = (hostname) =>
  hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127\./.test(hostname)

/**
 * 检查手机入口。error 时不能生成二维码；warn 只提示。
 * 规则与安卓端一致：HTTPS 任意主机；HTTP 只给内网 / VPN，IP 字面量在这里判断，域名交给手机连接时检查。
 * @param {string} value @param {string} handle
 * @returns {{level:'ok'|'warn'|'error', code:'ok'|'invalid'|'path'|'loopback'|'public-http'|'http'|'http-name'}}
 */
export function checkEndpoint(value, handle) {
  /** @type {URL} */
  let url
  try {
    url = new URL(normalizeEndpoint(value))
  } catch {
    return { level: 'error', code: 'invalid' }
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    return { level: 'error', code: 'invalid' }
  if (!url.pathname.endsWith(hookPath(handle))) return { level: 'error', code: 'path' }
  if (loopback(url.hostname)) return { level: 'error', code: 'loopback' }
  if (url.protocol === 'https:') return { level: 'ok', code: 'ok' }
  const local = privateHost(url.hostname)
  if (local === false) return { level: 'error', code: 'public-http' }
  return { level: 'warn', code: local ? 'http' : 'http-name' }
}

/** checkEndpoint 结果对应的提示 @type {Record<string, string>} */
const endpointMessages = {
  invalid: '地址格式不对，应为 http(s)://主机/hooks/phone-control/账号。',
  path: '路径必须以 /hooks/phone-control/{handle} 结尾。',
  loopback: 'localhost 只在本机有效，请换成电脑的内网或 VPN 地址。',
  'public-http': '公网地址必须使用 HTTPS；HTTP 只能用于内网或 VPN 地址。',
  http: 'HTTP 不加密，只在内网或 VPN 中使用。',
  'http-name': '手机连接时会检查这个域名，只有解析到内网或 VPN 地址才会用 HTTP 连接。',
}

/**
 * 二维码内容，格式见 PROTOCOL.md「配对链接」。
 * @param {string} endpoint @param {{deviceId:string, token:string}} pair
 */
export const pairingLink = (endpoint, pair) =>
  `nobot-phone://pair?v=1&url=${encodeURIComponent(normalizeEndpoint(endpoint))}&device=${pair.deviceId}&token=${pair.token}`

/** 自定义入口只存在本浏览器（不是密钥），方便下次打开页面时沿用。 */
const endpointKey = (/** @type {string} */ handle) => `phone-control:endpoint:${handle}`
/** @param {string} handle */
export function recallEndpoint(handle) {
  try {
    return localStorage.getItem(endpointKey(handle)) ?? ''
  } catch {
    return ''
  }
}
/** @param {string} handle @param {string} value 传空字符串表示恢复默认 */
export function rememberEndpoint(handle, value) {
  try {
    if (value) localStorage.setItem(endpointKey(handle), value)
    else localStorage.removeItem(endpointKey(handle))
  } catch {}
}

// ───────── 会话绑定 ─────────

/** @typedef {{id:string, title:string, owner:string, updatedAt:number}} ChatOption */
/**
 * 所有角色和群组的会话，按最近更新排序。宿主没有「全部会话」接口，只能逐个角色 / 群组读取。
 * @param {Pick<import('../../apps/web/src/extensions/types').ClientExtensionAPI, 'api'>} api
 * @returns {Promise<ChatOption[]>}
 */
export async function loadChatOptions(api) {
  const [characters, groups] = await Promise.all([api.api.listCharacters(), api.api.listGroups()])
  const lists = await Promise.all([
    ...characters.map((c) =>
      api.api
        .listChats({ characterId: c.id })
        .then((chats) => chats.map((v) => ({ id: v.id, title: v.title, owner: c.name, updatedAt: v.updatedAt }))),
    ),
    ...groups.map((g) =>
      api.api
        .listChats({ groupId: g.id })
        .then((chats) => chats.map((v) => ({ id: v.id, title: v.title, owner: g.name, updatedAt: v.updatedAt }))),
    ),
  ])
  return lists.flat().sort((a, b) => b.updatedAt - a.updatedAt)
}

// ───────── 配对状态 ─────────

/** @typedef {{paired:boolean, deviceId?:string, online:boolean, ready:boolean, lastSeen:number|null, job:{id:string,state:string}|null}} Status */
/** @typedef {{deviceId:string,token:string,protocol:number}} Pair */
/** @typedef {{status:Status|null, pair:Pair|null, handle:string, busy:boolean, error:string}} State */
/**
 * 状态控制与 React 分离，防止刷新旧响应覆盖新配对，页面卸载后不再保留密钥。
 * @param {Pick<import('../../apps/web/src/extensions/types').ClientExtensionAPI, 'fetchServer'|'api'>} api
 * @param {(state:State)=>void} notify
 */
export function createPairingController(api, notify) {
  /** @type {State} */
  let state = { status: null, pair: null, handle: '', busy: false, error: '' }
  let active = true
  let version = 0
  let refreshing = false
  const requests = new AbortController()
  /** @param {Partial<State>} patch */
  const update = (patch) => {
    if (active) {
      state = { ...state, ...patch }
      notify(state)
    }
  }
  /** @param {string} path @param {string} [method] */
  async function request(path, method = 'GET') {
    const response = await api.fetchServer(path, { method, signal: requests.signal })
    if (!response.ok) throw new Error(t('请求失败'))
    return response.json()
  }
  async function refresh() {
    if (!active || refreshing || state.busy) return
    refreshing = true
    const current = version
    try {
      const [status, user] = await Promise.all([
        request('/status'),
        state.handle ? Promise.resolve({ handle: state.handle }) : api.api.authMe(),
      ])
      if (current === version) {
        const next = /** @type {Status} */ (status)
        update({
          status: next,
          handle: user.handle,
          error: '',
          pair: state.pair && next.deviceId === state.pair.deviceId ? state.pair : null,
        })
      }
    } catch {
      if (current === version) update({ error: t('状态读取失败') })
    } finally {
      refreshing = false
    }
  }
  /** @param {'pair'|'revoke'} action */
  async function mutate(action) {
    if (!active || state.busy) return
    version++
    update({ busy: true, error: '' })
    try {
      const result = await request(`/${action}`, 'POST')
      if (action === 'pair') {
        const pair = /** @type {Pair} */ (result)
        update({
          pair,
          status: { paired: true, deviceId: pair.deviceId, online: false, ready: false, lastSeen: null, job: null },
        })
      } else update({ pair: null, status: { paired: false, online: false, ready: false, lastSeen: null, job: null } })
    } catch {
      update({ error: t('请求失败') })
    } finally {
      update({ busy: false })
    }
  }
  return {
    refresh,
    mutate,
    dispose() {
      active = false
      version++
      state = { ...state, pair: null }
      requests.abort()
    },
  }
}

// ───────── 界面 ─────────

/** @param {import('../../apps/web/src/extensions/types').ClientExtensionAPI} api */
export default function activate(api) {
  const { createElement: h, Fragment, useState, useEffect, useRef, useMemo } = api.React
  /** @typedef {import('../../apps/web/node_modules/@types/react').ReactNode} Node */

  /** @param {string} value */
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value)
      api.toast.info(t('已复制'))
    } catch {
      api.toast.error(t('复制失败，请手动选择并复制字段内容。'))
    }
  }

  /**
   * @param {{label:Node, onClick:()=>void, primary?:boolean, danger?:boolean, ghost?:boolean, disabled?:boolean, title?:string}} props
   */
  const Button = ({ label, onClick, primary, danger, ghost, disabled, title }) =>
    h(
      'button',
      {
        type: 'button',
        className: `pc-btn${primary ? ' primary' : ''}${danger ? ' danger' : ''}${ghost ? ' ghost' : ''}`,
        disabled,
        title,
        onClick,
      },
      label,
    )
  /** @param {string} title @param {Node} extra @param {...Node} children */
  const Card = (title, extra, ...children) =>
    h('section', { className: 'pc-card' }, h('div', { className: 'pc-card-title' }, title, extra ?? null), ...children)

  /** 只读字段 + 复制按钮 @param {{label:string, value:string, secret?:boolean}} props */
  function CopyField({ label, value, secret }) {
    return h(
      'div',
      { className: 'pc-field' },
      h('span', { className: 'pc-label' }, t(label)),
      h(
        'div',
        { className: 'pc-row' },
        h('input', {
          value,
          readOnly: true,
          type: secret ? 'password' : 'text',
          className: 'pc-mono',
          autoComplete: 'off',
          spellCheck: false,
          'aria-label': t(label),
          onFocus: (/** @type {{target: HTMLInputElement}} */ event) => event.target.select(),
        }),
        h(Button, { label: t('复制'), onClick: () => void copy(value) }),
      ),
    )
  }

  /** @param {{text:string, revealed:boolean, onReveal:()=>void}} props */
  function QrCode({ text, revealed, onReveal }) {
    const modules = useMemo(() => encodeQr(text), [text])
    const view = modules.length + 8
    return h(
      'div',
      { className: `pc-qr${revealed ? '' : ' covered'}` },
      h(
        'svg',
        { viewBox: `0 0 ${view} ${view}`, role: 'img', 'aria-label': t('配对'), shapeRendering: 'crispEdges' },
        h('rect', { width: view, height: view, fill: '#fff' }),
        h('path', { d: qrPath(modules), fill: '#18181b' }),
      ),
      revealed
        ? null
        : h('div', { className: 'pc-qr-cover' }, h(Button, { label: t('显示二维码'), onClick: onReveal })),
    )
  }

  /** 手机入口：可编辑，记住自定义值；本机访问时列出可用的内网 / VPN 地址 */
  /** @param {{handle:string, value:string, onChange:(value:string)=>void}} props */
  function EndpointField({ handle, value, onChange }) {
    const [addresses, setAddresses] = useState(/** @type {string[]} */ ([]))
    const fallback = defaultEndpoint(location.origin, handle)
    useEffect(() => {
      if (!loopback(location.hostname)) return
      let live = true
      api
        .fetchServer('/addresses')
        .then((r) => (r.ok ? r.json() : { addresses: [] }))
        .then((/** @type {{addresses:string[]}} */ data) => live && setAddresses(data.addresses))
        .catch(() => {})
      return () => {
        live = false
      }
    }, [])
    const check = checkEndpoint(value, handle)
    const port = location.port ? `:${location.port}` : ''
    return h(
      'div',
      { className: 'pc-field' },
      h(
        'div',
        { className: 'pc-row between' },
        h('label', { className: 'pc-label', htmlFor: 'pc-endpoint' }, t('手机入口')),
        normalizeEndpoint(value) !== fallback
          ? h('button', { type: 'button', className: 'pc-link', onClick: () => onChange(fallback) }, t('恢复默认'))
          : null,
      ),
      h('input', {
        id: 'pc-endpoint',
        value,
        className: `pc-mono${check.level === 'error' ? ' invalid' : ''}`,
        autoComplete: 'off',
        spellCheck: false,
        onChange: (/** @type {{target: HTMLInputElement}} */ event) => onChange(event.target.value),
      }),
      addresses.length > 0
        ? h(
            'div',
            { className: 'pc-row wrap' },
            h('span', { className: 'pc-muted' }, t('可用地址')),
            ...addresses.map((ip) => {
              const candidate = `http://${ip}${port}${hookPath(handle)}`
              return h(
                'button',
                {
                  key: ip,
                  type: 'button',
                  className: 'pc-chip',
                  'aria-pressed': normalizeEndpoint(value) === candidate,
                  onClick: () => onChange(candidate),
                },
                ip,
              )
            }),
          )
        : null,
      check.level === 'ok'
        ? h('span', { className: 'pc-muted' }, t('手机通过这个地址连接 NoBot，必须是手机能访问到的地址。'))
        : h(
            'span',
            { className: check.level === 'error' ? 'pc-error' : 'pc-warn' },
            t(endpointMessages[check.code] ?? '', { handle }),
          ),
    )
  }

  /** @param {{state:State, endpoint:string, setEndpoint:(value:string)=>void, onPair:()=>void}} props */
  function PairingCard({ state, endpoint, setEndpoint, onPair }) {
    const [revealed, setRevealed] = useState(false)
    const [manual, setManual] = useState(false)
    const status = state.status
    const pair = state.pair
    const connected = !!status?.online && status.ready
    // 换了一组凭据就重新遮住二维码
    useEffect(() => {
      setRevealed(false)
      setManual(false)
    }, [pair?.token])
    // 手机一连上就收起二维码和密钥，避免一直摊在屏幕上；需要时可再次显示
    useEffect(() => {
      if (connected) {
        setRevealed(false)
        setManual(false)
      }
    }, [connected])
    const valid = !!state.handle && checkEndpoint(endpoint, state.handle).level !== 'error'
    /** @type {Node} */
    let body
    if (pair) {
      const link = valid ? pairingLink(endpoint, pair) : ''
      const showQr = !connected || revealed
      body = h(
        'div',
        { className: 'pc-pair' },
        showQr
          ? valid
            ? h(QrCode, { text: link, revealed, onReveal: () => setRevealed(true) })
            : h('div', { className: 'pc-qr pc-qr-empty' }, t('入口地址有误，修正后才能生成二维码。'))
          : null,
        h(
          'div',
          { className: 'pc-pair-side' },
          h(
            'p',
            null,
            t(
              connected
                ? '手机已连接。配对码仍可再次显示，离开本页后失效。'
                : '用手机伴侣点「扫码配对」，或用系统相机扫描后选择用 NoBot 打开。',
            ),
          ),
          h('p', { className: 'pc-muted' }, t('二维码含有配对密钥，只在本次页面中显示，离开后无法再次查看。')),
          h(
            'div',
            { className: 'pc-row wrap' },
            connected && !revealed
              ? h(Button, { label: t('再次显示二维码'), onClick: () => setRevealed(true) })
              : revealed
                ? h(Button, { label: t('隐藏二维码'), onClick: () => setRevealed(false) })
                : null,
            h(Button, { label: t('复制配对链接'), disabled: !valid, onClick: () => void copy(link) }),
            h(Button, { label: t('手动填写'), ghost: true, onClick: () => setManual(!manual) }),
          ),
        ),
      )
      if (manual)
        body = [
          h(Fragment, { key: 'pair' }, body),
          h(
            'div',
            { key: 'manual', className: 'pc-manual' },
            h(CopyField, { label: '手机入口', value: normalizeEndpoint(endpoint) }),
            h(CopyField, { label: '设备ID', value: pair.deviceId }),
            h(CopyField, { label: '配对密钥', value: pair.token, secret: !revealed }),
          ),
        ]
    } else
      body = h(
        'div',
        { className: 'pc-empty' },
        h(
          'p',
          null,
          t(
            status?.paired
              ? '已配对。服务器不保存可回显的密钥；换手机或重装 App 时请重新配对。'
              : '还没有配对手机。生成配对码后，用手机伴侣 App 扫一扫即可填好全部参数。',
          ),
        ),
        status && !status.paired
          ? h(Button, {
              label: t(state.busy ? '正在处理' : '生成配对信息'),
              primary: true,
              disabled: state.busy || !state.handle || !valid,
              onClick: onPair,
            })
          : null,
      )
    return Card(
      t('配对'),
      null,
      state.handle ? h(EndpointField, { handle: state.handle, value: endpoint, onChange: setEndpoint }) : null,
      body,
    )
  }

  /** @param {{state:State, onRefresh:()=>void, onConfirm:(action:'pair'|'revoke')=>void}} props */
  /** 断线原因（App 0.5.5 起上报；旧版 App 只有服务端看到的间隔，原因未知） */
  const CAUSES = /** @type {Record<string,string>} */ ({
    frozen: 'App 被系统冻结',
    network: '网络连不上服务器',
    restarted: 'App 或无障碍服务重启过',
    paused: '手动暂停',
    unknown: '原因未知',
  })

  /** 最近断线：恢复时间 · 断了多久（服务端看到的间隔）· 原因 */
  function Disconnects({ list }) {
    const frozen = list.some((d) => d.cause === 'frozen')
    return h(
      'div',
      { className: 'pc-section' },
      h('div', { className: 'pc-label' }, t('最近断线')),
      h(
        'ol',
        { className: 'pc-log' },
        ...list.map((d) =>
          h(
            'li',
            { key: d.at, className: 'pc-log-item' },
            h(
              'div',
              null,
              h(
                'div',
                { className: 'pc-log-action' },
                `${new Date(d.at).toLocaleString()} · ${t('{minutes} 分钟', { minutes: Math.max(1, Math.round(d.gapMs / 60000)) })}`,
              ),
              h(
                'div',
                { className: 'pc-log-thought' },
                [t(CAUSES[d.cause] ?? '原因未知'), d.error].filter(Boolean).join(' · '),
              ),
            ),
          ),
        ),
      ),
      frozen
        ? h(
            'p',
            { className: 'pc-muted' },
            t('经常显示「被系统冻结」时，在手机设置里允许 NoBot Phone 后台高耗电、自启动，并在多任务里锁定它。'),
          )
        : null,
    )
  }

  function StatusCard({ state, onRefresh, onConfirm }) {
    const [confirm, setConfirm] = useState(/** @type {'pair'|'revoke'|null} */ (null))
    const status = state.status
    const jobNames = /** @type {Record<string,string>} */ ({
      queued: '等待交付',
      delivered: '已交付',
      done: '已完成',
      cancelled: '已取消',
      expired: '已过期',
    })
    /** @type {[string, Node][]} */
    const rows = [
      ['上次连接', status?.lastSeen ? new Date(status.lastSeen).toLocaleString() : t('尚未连接')],
      ['当前指令', status?.job ? t(jobNames[status.job.state] ?? status.job.state) : t('无')],
    ]
    if (status?.deviceId) rows.unshift(['设备ID', h('span', { className: 'pc-mono' }, status.deviceId)])
    return Card(
      t('连接状态'),
      h(Button, { label: '↻', ghost: true, title: t('刷新'), disabled: state.busy, onClick: onRefresh }),
      h(
        'dl',
        { className: 'pc-dl' },
        ...rows.flatMap(([label, value]) => [
          h('dt', { key: `${label}-t` }, t(label)),
          h('dd', { key: `${label}-d` }, value),
        ]),
      ),
      status?.disconnects?.length ? h(Disconnects, { list: status.disconnects }) : null,
      status?.paired
        ? confirm
          ? h(
              'div',
              { className: 'pc-banner', role: 'alert' },
              h(
                'p',
                null,
                t(
                  confirm === 'pair'
                    ? '重新配对会立即使旧密钥失效，并清除当前指令。'
                    : '撤销后，这台手机将无法继续接收指令。已经发生的操作无法撤回。',
                ),
              ),
              h(
                'div',
                { className: 'pc-row' },
                h(Button, {
                  label: t(confirm === 'pair' ? '确认重新配对' : '确认撤销'),
                  primary: confirm === 'pair',
                  danger: confirm === 'revoke',
                  disabled: state.busy,
                  onClick: () => {
                    setConfirm(null)
                    onConfirm(confirm)
                  },
                }),
                h(Button, { label: t('取消'), onClick: () => setConfirm(null) }),
              ),
            )
          : h(
              'div',
              { className: 'pc-row wrap' },
              h(Button, { label: t('重新配对'), disabled: state.busy, onClick: () => setConfirm('pair') }),
              h(Button, {
                label: t('撤销授权'),
                danger: true,
                disabled: state.busy,
                onClick: () => setConfirm('revoke'),
              }),
            )
        : null,
    )
  }

  /** @typedef {{index:number, thought:string, action:string, result:string, at:number}} TaskStep */
  /** @typedef {{id:string, goal:string, mode:'wait'|'background', status:string, startedAt:number, endedAt?:number, steps:TaskStep[], summary?:string, memories?:string[]}} Task */

  /** 操作员任务：目标、状态、最近几步（想法 → 动作 → 结果）、总结；进行中可以停止。每 3 秒刷新 */
  function TaskCard() {
    const [task, setTask] = useState(/** @type {Task|null} */ (null))
    const [busy, setBusy] = useState(false)
    useEffect(() => {
      let live = true
      const load = () =>
        api
          .fetchServer('/task')
          .then((r) => (r.ok ? r.json() : { task: null }))
          .then((/** @type {{task: Task|null}} */ data) => live && setTask(data.task))
          .catch(() => {})
      void load()
      const timer = setInterval(() => {
        if (!document.hidden) void load()
      }, 3000)
      return () => {
        live = false
        clearInterval(timer)
      }
    }, [])
    async function stop() {
      setBusy(true)
      try {
        await api.fetchServer('/task/stop', { method: 'POST' })
        setTask((current) => (current ? { ...current, status: 'stopped' } : current))
      } catch {
        api.toast.error(t('请求失败'))
      } finally {
        setBusy(false)
      }
    }
    if (!task)
      return Card(
        t('手机任务'),
        null,
        h('p', { className: 'pc-muted' }, t('角色在绑定会话里使用手机时，这里会实时显示过程。')),
      )
    const names = /** @type {Record<string,[string,string]>} */ ({
      running: ['进行中', 'warn'],
      done: ['已完成', 'good'],
      gave_up: ['放弃了', 'bad'],
      error: ['出错了', 'bad'],
      time: ['到时间了', ''],
      steps: ['到步数上限', ''],
      stopped: ['已停止', ''],
    })
    const [label, tone] = names[task.status] ?? [task.status, '']
    const minutes = Math.max(1, Math.round(((task.endedAt ?? Date.now()) - task.startedAt) / 60000))
    const steps = task.steps.slice(-8).reverse()
    return Card(
      t('手机任务'),
      task.status === 'running'
        ? h(Button, { label: t('停止'), danger: true, disabled: busy, onClick: () => void stop() })
        : null,
      h(
        'div',
        { className: 'pc-field' },
        h(
          'div',
          { className: 'pc-row between' },
          h('strong', { className: 'pc-grow' }, task.goal),
          h('span', { className: `pc-pill ${tone}` }, t(label)),
        ),
        h(
          'span',
          { className: 'pc-muted' },
          t('{mode} · {count} 步 · {minutes} 分钟', {
            mode: t(task.mode === 'wait' ? '等结果' : '后台'),
            count: String(task.steps.length),
            minutes: String(minutes),
          }),
        ),
      ),
      task.summary && task.status !== 'running' ? h('p', null, task.summary) : null,
      task.memories?.length
        ? h(
            'div',
            { className: 'pc-field' },
            h('span', { className: 'pc-label' }, t('记下的')),
            h('ul', { className: 'pc-notes' }, ...task.memories.map((m, i) => h('li', { key: i }, m))),
          )
        : null,
      steps.length
        ? h(
            'ol',
            { className: 'pc-log' },
            ...steps.map((step) =>
              h(
                'li',
                { key: step.index, className: 'pc-log-item' },
                h('span', { className: 'pc-log-index' }, String(step.index)),
                h(
                  'div',
                  { className: 'pc-grow' },
                  step.thought ? h('div', { className: 'pc-log-thought' }, step.thought) : null,
                  h(
                    'div',
                    { className: 'pc-log-action' },
                    step.action,
                    step.result === 'OK' ? null : h('span', { className: 'pc-warn' }, ` → ${step.result}`),
                  ),
                ),
              ),
            ),
          )
        : null,
    )
  }

  function AccessCard() {
    const [options, setOptions] = useState(/** @type {ChatOption[]|null} */ (null))
    const [saved, setSaved] = useState('')
    const [chatId, setChatId] = useState('')
    const [busy, setBusy] = useState(false)
    useEffect(() => {
      let live = true
      Promise.all([api.getSettings(), loadChatOptions(api)])
        .then(([settings, list]) => {
          if (!live) return
          const id = typeof settings.chatId === 'string' ? settings.chatId : ''
          setSaved(id)
          setChatId(id)
          setOptions(list)
        })
        .catch(() => live && api.toast.error(t('请求失败')))
      return () => {
        live = false
      }
    }, [])
    const current = api.getChatId()
    const missing = !!chatId && !!options && !options.some((o) => o.id === chatId)
    async function save() {
      setBusy(true)
      try {
        // 读最新设置再合并，避免覆盖设置页里刚保存的其他字段
        await api.saveSettings({ ...(await api.getSettings()), chatId })
        setSaved(chatId)
        api.toast.info(t('已保存'))
      } catch {
        api.toast.error(t('请求失败'))
      } finally {
        setBusy(false)
      }
    }
    return Card(
      t('模型权限'),
      null,
      h(
        'div',
        { className: 'pc-field' },
        h('label', { className: 'pc-label', htmlFor: 'pc-chat' }, t('允许控制手机的会话')),
        h(
          'div',
          { className: 'pc-row' },
          h(
            'select',
            {
              id: 'pc-chat',
              value: chatId,
              disabled: !options,
              onChange: (/** @type {{target: HTMLSelectElement}} */ event) => setChatId(event.target.value),
            },
            h('option', { value: '' }, options ? t('不允许任何会话') : t('正在读取')),
            missing ? h('option', { value: chatId }, chatId) : null,
            ...(options ?? []).map((o) => h('option', { key: o.id, value: o.id }, `${o.owner} · ${o.title}`)),
          ),
          h(Button, {
            label: t('保存'),
            primary: true,
            disabled: busy || chatId === saved,
            onClick: () => void save(),
          }),
        ),
        missing
          ? h('span', { className: 'pc-warn' }, t('当前绑定的会话已不存在：{id}', { id: chatId }))
          : h(
              'span',
              { className: 'pc-muted' },
              t('这个会话开启工具调用后，角色可以使用 phone_control 工具。主模型需要支持看图。'),
            ),
      ),
      current && current !== chatId && options?.some((o) => o.id === current)
        ? h(
            'div',
            null,
            h('button', { type: 'button', className: 'pc-link', onClick: () => setChatId(current) }, t('使用当前会话')),
          )
        : null,
    )
  }

  function PairingPage() {
    const [state, setState] = useState(
      /** @type {State} */ ({ status: null, pair: null, handle: '', busy: false, error: '' }),
    )
    const [endpoint, setEndpointValue] = useState('')
    // 每次挂载创建控制器；密钥不会写入 localStorage、查询缓存或扩展设置。
    const controller = useRef(/** @type {ReturnType<typeof createPairingController>|null} */ (null))
    useEffect(() => {
      const session = createPairingController(api, setState)
      controller.current = session
      void session.refresh()
      const timer = setInterval(() => {
        if (!document.hidden) void session.refresh()
      }, 3000)
      return () => {
        clearInterval(timer)
        session.dispose()
        controller.current = null
      }
    }, [])
    useEffect(() => {
      if (state.handle) setEndpointValue(recallEndpoint(state.handle) || defaultEndpoint(location.origin, state.handle))
    }, [state.handle])
    /** @param {string} value */
    function setEndpoint(value) {
      setEndpointValue(value)
      const fallback = defaultEndpoint(location.origin, state.handle)
      rememberEndpoint(state.handle, normalizeEndpoint(value) === fallback ? '' : value)
    }
    const status = state.status
    const statusText = state.error
      ? '状态读取失败'
      : !status
        ? '正在读取'
        : !status.paired
          ? '未配对'
          : !status.online
            ? '离线'
            : !status.ready
              ? '未就绪'
              : '已连接'
    const tone = state.error
      ? 'bad'
      : status?.online && status.ready
        ? 'good'
        : status?.paired && status.online
          ? 'warn'
          : ''
    return h(
      'div',
      { className: 'pc pc-page' },
      h(
        'header',
        { className: 'pc-head' },
        h(
          'div',
          { className: 'pc-grow' },
          h(
            'div',
            { className: 'pc-row' },
            h('h3', null, t('手机控制')),
            h('span', { className: `pc-pill ${tone}`, role: 'status' }, t(statusText)),
          ),
          h('p', { className: 'pc-muted' }, t('用 NoBot 手机伴侣扫码连接安卓手机，角色就能看屏幕、点按和输入。')),
        ),
      ),
      state.error ? h('p', { role: 'alert', className: 'pc-error' }, state.error) : null,
      h(
        'div',
        { className: 'pc-grid' },
        h(
          'div',
          { className: 'pc-col' },
          h(PairingCard, {
            state,
            endpoint,
            setEndpoint,
            onPair: () => void controller.current?.mutate('pair'),
          }),
          Card(
            t('手机端准备'),
            null,
            h(
              'ol',
              { className: 'pc-steps' },
              ...[
                '安装 NoBot 手机伴侣（Android 11 及以上），扫码或粘贴配对链接并确认。',
                '点「打开无障碍设置」，手动开启 NoBot 手机伴侣。',
                '回到 App 点「开始接受指令」，再回到桌面；本页状态每三秒刷新。',
                '熄屏也要用：在 App 里点「关闭电池优化」并允许后台运行；锁屏不能设密码，或开启 Smart Lock 让手机在可信场景保持解锁。想全程黑屏操作，在 App 里选「只关屏幕面板」（需要 Shizuku 或 Root）。',
              ].map((text) => h('li', { key: text }, t(text))),
            ),
          ),
        ),
        h(
          'div',
          { className: 'pc-col' },
          h(TaskCard),
          h(StatusCard, {
            state,
            onRefresh: () => void controller.current?.refresh(),
            onConfirm: (action) => void controller.current?.mutate(action),
          }),
          h(AccessCard),
        ),
      ),
    )
  }
  api.registerPage({ id: 'pairing', label: t('配对管理'), icon: '📱', render: () => h(PairingPage) })
  api.registerSlot('extensions.settings.footer', {
    id: 'pairing-link',
    render: () =>
      h(
        'div',
        { className: 'pc' },
        h(
          'button',
          { type: 'button', className: 'pc-btn', onClick: () => api.openView('ext:phone-control:pairing') },
          `📱 ${t('配对管理')}`,
        ),
      ),
  })
}
