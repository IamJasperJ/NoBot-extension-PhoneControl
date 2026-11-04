# 手机桥接协议 v1

## 配对链接（v1）

网页「配对管理」的二维码、「复制配对链接」和 App 的扫码 / 粘贴 / 系统深链共用一种格式：

```text
nobot-phone://pair?v=1&url=<encodeURIComponent(手机入口)>&device=<32位十六进制>&token=<64位十六进制>
```

- 参数顺序不固定；`v` 不是 `1` 时 App 提示更新。手机入口末尾的 `/` 去掉。
- App 收到链接后**不直接保存**，先弹框显示服务器地址，确认后才写入配置（链接可能来自任意网页或 App）。

## 手机入口地址

- 不允许 userinfo、query、fragment；路径以 `/hooks/phone-control/<handle>` 结尾。
- `https`：任意主机。
- `http`：只给内网 / VPN。私有地址：IPv4 `10/8`、`172.16/12`、`192.168/16`、`100.64/10`（Tailscale 等）、`169.254/16`、`127/8`；IPv6 `fc00::/7`、`fe80::/10`、`::1`。
  - 网页和 App 保存时只判断 IP 字面量；域名放行。
  - App 每次请求前解析域名，所有地址都必须是私有地址，否则暂停并提示「公网地址必须使用 HTTPS」。
- 网页额外拒绝 `localhost` / `127.x`：那是电脑自己，手机访问不到。
- 管理端 `GET /api/ext/phone-control/addresses` 返回本机的内网 / VPN IPv4（Docker 容器内返回空），页面在 localhost 打开时作为候选入口。

## 设备端

前缀：`/hooks/phone-control/<handle>`。宿主先验证账号存在、启用且允许该扩展，再交给插件鉴权。

所有请求必须携带：

```http
Authorization: Bearer <64位十六进制token>
X-Device-Id: <32位十六进制deviceId>
Content-Type: application/json
```

`POST /poll`：

```json
{ "protocol": 1, "ready": true }
```

无指令返回 `{ "protocol": 1, "job": null }`；有指令返回：

```json
{
  "protocol": 1,
  "job": {
    "id": "command-id",
    "ttlMs": 24000,
    "command": { "action": "tap", "x": 0.5, "y": 0.5 }
  }
}
```

客户端从发起轮询的本地单调时间开始计算 ttlMs，避免依赖服务器与手机时钟一致。不得执行过期或已执行过的 id。

`POST /result`：

```json
{
  "id": "command-id",
  "result": {
    "ok": true,
    "code": "OK",
    "data": { "width": 1080, "height": 2400, "nodes": [] },
    "image": "JPEG_BASE64"
  }
}
```

`data` 和 `image` 可省略。`image` 是纯 JPEG Base64，不带 data URI 前缀。回报总请求体上限 3,000,000 字节，节点数据 JSON 上限 100,000 字符。图片通过宿主模型工具继续做附件解码校验。

成功或重复回报返回 `{ "accepted": true }`；已过期、被撤销、指令不匹配返回 409。重复回报不会覆盖第一次结果。401/403/404 需要停止轮询并重新检查授权，不能重试执行旧动作。

## 登录管理端

前缀：`/api/ext/phone-control`，沿用 NoBot 会话认证。手机令牌不能代替登录态访问这些接口。

| 方法与路径 | 行为 |
| --- | --- |
| `POST /pair` | 创建一组新凭据，替换旧设备 |
| `POST /revoke` | 删除设备与当前指令 |
| `GET /status` | 配对、在线、就绪状态及当前指令摘要，不返回密钥和截图 |
| `GET /task` | `{ task, memories }`：当前或上一次手机任务（目标、状态、最近 40 步）和近期记忆 |
| `POST /task/stop` | 停止正在进行的手机任务 |
| `GET /addresses` | `{ addresses: string[] }`，本机内网 / VPN IPv4，用于推荐手机入口 |
| `POST /commands` | 请求体为动作，202 返回 `{ id }`；忙碌/离线 409 |
| `GET /commands/:id` | `{ result: null }` 或结果；未知/过期/取消 409 |
| `POST /cancel` | 取消尚未交付的指令；已交付操作不会被当作撤回成功 |

所有接口响应 `Cache-Control: no-store`。

## 动作

| action | 额外字段 | 说明 |
| --- | --- | --- |
| `observe` | 无 | 界面节点 + 截图，无法截图时返回明确错误 |
| `tap` | x, y, duration? | 坐标 0–1；duration 按下毫秒 40–400，默认 80 |
| `longpress` | x, y, duration? | duration 400–2000，默认 700（App 0.5.0 起） |
| `swipe` | x, y, endX, endY, duration?, points? | 坐标 0–1；duration 整数毫秒 100–2000，默认 500；points 是最多 16 个途经点 `[x, y]`，旧版 App 忽略、走直线 |
| `type` | text | 1–2000 字符，替换聚焦可编辑输入框文字 |
| `open` | packageName | Android 包名，最长 200 字符 |
| `enter` | 无 | 对聚焦输入框按输入法的回车 / 搜索 / 发送（App 0.5.0 起） |
| `apps` | 无 | 返回 `data.apps: [{ label, packageName }]`，桌面上能打开的应用，最多 300 个（App 0.5.0 起） |
| `back` | 无 | 系统返回 |
| `home` | 无 | 系统主页 |
| `recents` | 无 | 系统最近任务 |

锁屏相关的回报码：`DEVICE_LOCKED`（有锁屏密码，或亮屏后 3 秒内没能解锁）、`SCREEN_OFF`（熄屏且手机上关闭了自动亮屏）。

`LAUNCH_REQUESTED` 仅表示已向系统请求打开应用，不能据此认定应用已显示；继续观察。动作成功同样不代表业务任务成功。

## 状态转换

```text
queued → delivered → done
  ↓           ↓
cancelled    超时：结果未知
```

过期条目不能再次交付，旧回报不能覆盖新指令。服务器重启后读取持久化状态，不把 `delivered` 重置为 `queued`。

旧版 App 收到 `longpress` / `enter` / `apps` 会回报 `UNSUPPORTED_ACTION`，操作员据此改用别的办法（比如点搜索按钮、回桌面点图标）。
