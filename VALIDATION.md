# 验证记录

日期：2026-11-04。所有新增文件位于 `external-extension/phone-control/`，没有修改主项目文件，没有新增 npm 依赖。

## 自动检查结果

- 插件状态机、协议、HTTP 接口和模型工具：12 项测试通过，60 个断言。
- 真实安装集成：1 项测试通过。复制运行文件到临时 `DATA_DIR/users/test/extensions/phone-control/`，由真实宿主扫描加载、批准权限、启用；完成管理端配对、设备鉴权、轮询、派发、回报及读取；验证错误回报返回 400，停用后手机入口返回 404。
- 现有宿主回归：`apps/server/test/extensions.test.ts`、`apps/server/test/tool-images.test.ts` 两项集成场景通过。
- `bunx tsc --noEmit -p external-extension/phone-control`：通过。
- `bunx tsc --noEmit -p apps/server`：通过。
- `bunx biome check external-extension/phone-control/*.ts external-extension/phone-control/*.json`：通过。
- Android `./gradlew --no-daemon assembleDebug lintDebug`：通过。JDK 17、SDK 35、Build Tools 35.0.0、Gradle 8.11.1、AGP 8.9.2。
- Android Lint：`No issues found.`，零错误、零警告。Java 编译器提示使用了部分平台已弃用 API，不影响构建。

## 已覆盖的异常场景

错误令牌、用户隔离、重新配对撤销、设备离线和未就绪、设备忙碌、重复轮询、服务端状态重建、未交付回报、跨设备回报、重复回报、超时和迟到回报、排队取消、已交付指令继续占用租约、动作/坐标/文字/图片校验、无效及超大请求体、管理接口与设备接口隔离、模型会话绑定、图片回传、取消工具等待。

## 尚未验证

没有连接真实安卓设备，也没有运行安卓模拟器。无障碍授权、不同厂商系统的后台策略、实际触摸坐标、真实 App 的中文/表情输入、系统截图限制和跨网络重连仍需按照 README 真机验收。自动测试中的手机端由协议请求模拟，不等于已经完成真机端到端验证。

未部署到用户服务器，没有安装到用户手机。APK 为调试签名安装包，正式发布签名不在本次底层工作范围。

## 0.1.1 配对管理页面

- 新增 `client.js`、`style.css`、`client.test.js`、`tsconfig.client.json`；更新 manifest、入口版本、真实安装测试和说明文档。
- `bun test external-extension/phone-control`：18 项通过，145 个断言。新增页面状态测试覆盖一次性密钥、撤销、重复提交、旧响应、卸载中止及中英文文案；真实安装测试验证前端 JS/CSS 能由宿主加载。
- 插件服务端与前端分别执行 TypeScript 类型检查，均通过；全部插件 TS/JS/JSON/CSS 的 Biome 检查通过。
- Chrome 无头浏览器加载真实 React 19 和插件组件，在 StrictMode 下模拟首次配对并检查截图：入口、设备 ID、隐藏密钥、重新配对与撤销按钮显示正常。预览使用模拟账号和模拟凭据，不是真实手机联调。
- 版本 0.1.1 仅更新服务器插件及管理页面，Android App 和通信协议未改动，继续使用 0.1.0 APK。升级后需重新扫描插件并批准新增前端权限。

## 0.2.0 扫码配对、内网 HTTP、配对页改版

- 网页：配对页按宿主 / 其他外置扩展的视觉规范重写（`pc-` 前缀，zinc + violet，32px 控件，卡片双栏，深色与窄屏适配）；内置二维码编码器（字节模式、M 级纠错）；手机入口校验与本机内网 / VPN 地址推荐；模型会话改为下拉选择。
- 服务端：新增 `GET /addresses`。
- 安卓 0.2.0：App 内扫码（旧版 Camera API + zxing-core 3.5.3）、`nobot-phone://pair` 深链、粘贴配对链接，三者都先确认服务器地址再保存；HTTP 仅限解析到内网 / VPN 的地址。
- `bun test external-extension/phone-control`：23 项通过，270 个断言（新增入口规则、配对链接、二维码结构、会话列表、本机地址推荐）。两套 TS 类型检查、Biome 通过。
- Android：`./gradlew testDebugUnitTest assembleDebug lintDebug` 通过，Endpoint 单元测试 5 项，Lint `No issues found.`。
- 二维码互通：网页编码器生成 19 段不同长度文字（版本 1–33），用 App 同款 zxing-core 3.5.3 全部解码一致。
- 浏览器验收（Cursor + Playwright，临时数据目录）：入口默认值 / localhost 拒绝 / 候选地址 / 公网 HTTP 拒绝 / 记住入口 / 二维码遮罩与显示 / 复制链接 / 撤销确认 / 模型权限 / 深色 / 390px 窄屏 / 英文界面 / 设置页快捷入口 / 内网 IP 打开 / 模拟手机 poll 后变「已连接」均通过。验收发现的 React key 警告、连接后已显示的二维码不收起两处已修复。
- 仍未验证：真机扫码（相机对焦、各厂商扫一扫对深链的支持）、真机通过内网 HTTP 轮询。

## 0.3.0 熄屏使用

- 安卓：控制开启期间持有 CPU 唤醒锁（每轮续期）、熄屏放慢轮询；指令到达时按 `Screen.decide` 决定直接执行 / 亮屏解锁（透明 UnlockActivity，单独任务栈）/ 回报 `DEVICE_LOCKED` / `SCREEN_OFF`；自己点亮的屏幕空闲 30 秒后用无障碍锁屏动作锁回，检测到用户操作则不锁。主页新增自动亮屏开关、电池优化状态与豁免按钮、应用后台设置入口。
- 服务端：工具说明补充两种锁屏回报的含义；网页「手机端准备」增加熄屏设置一步。
- `./gradlew testDebugUnitTest assembleDebug lintDebug` 通过：单元测试 7 项（新增 ScreenTest 2 项），Lint `No issues found.`。`bun test external-extension/phone-control` 23 项通过，两套类型检查和 Biome 通过。
- 未验证：没有真机 / 模拟器，亮屏、解锁、自动锁回、熄屏轮询和各厂商省电策略都需要真机确认。

## 0.4.0 只关屏幕面板

- 安卓：熄屏方式可选「亮屏解锁」/「只关屏幕面板」；权限来源可选 Shizuku（用户服务 PanelUserService，AIDL IPanel，绑定应用进程令牌，应用退出时恢复面板）或 Root（su 启动 `app_process` 运行 PanelServer，标准输入逐行 off / on，管道关闭时恢复面板）。关面板通过 SurfaceControl.setDisplayPowerMode，Android 14 起从 DisplayControl 取屏幕令牌。主页新增模式 / 权限单选、检测权限、现在关闭屏幕面板、面板状态。
- `./gradlew testDebugUnitTest assembleDebug lintDebug` 通过：单元测试 8 项（新增 PanelTest 1 项），Lint `No issues found.`。插件 `bun test` 23 项、两套类型检查和 Biome 通过。
- 未验证：没有可连接的安卓设备，Shizuku / Root 授权、面板关闭与恢复、关面板时截图是否正常、各厂商系统的兼容性都需要真机确认。

## 0.4.1（仅安卓）

- 真机反馈「Shizuku 没有运行」：Shizuku 服务端在 App 进程状态变化时才发送接口，App 进程因无障碍服务常驻、早于 Shizuku 启动时可能还没收到。检测权限改到后台线程并最多等待 3 秒；主页新增 Shizuku 连接 / 授权状态实时显示；提示文字说明已在运行时如何处理（强行停止后重开）。
- 构建、Lint（No issues found）、8 项单元测试通过。

## 0.4.2（仅安卓）

- 主界面重做：状态卡（连接状态色点、服务器地址、开始 / 暂停合一的主按钮）、配对（扫码 / 粘贴一行，手动填写默认收起）、准备工作清单（无障碍、电池优化、后台运行、通知，未完成项旁边给操作按钮）、熄屏使用（自动亮屏开关，选「只关屏幕面板」时才显示权限来源与操作）。配色与网页一致，跟随系统深色模式。
- 构建、Lint（No issues found）、8 项单元测试通过。未在模拟器或真机上看过界面效果。

## 0.5.0 手机任务（操作员）

- 插件目录建立独立 git 仓库，0.4.2 作为基线提交。
- 服务端：新增 `phone_task` 与操作员循环（operator / tasks / marks / commands / host），`phone_control` 改为设置里开启；配对页新增「手机任务」卡片；设置新增操作员连接 / 模型、时长、步数上限。协议新增 `longpress`、`enter`、`apps`，`tap` 可带时长、`swipe` 可带途经点。
- 安卓 0.5.0：支持上述新动作。构建、Lint（No issues found）、8 项单元测试通过。
- `bun test external-extension/phone-control`：41 项通过，类型检查和 Biome 通过。覆盖：屏幕整理与去重、拟人点按 / 滚动的范围与方向、回答解析（代码块、废话、字符串里的括号、错误原因）、按名字找应用、主循环的 done / 格式错误重试 / 时间与步数上限补回顾 / 锁屏放弃 / 打开应用 / 停止；工具层的同步任务全流程、后台任务、忙碌拒绝、停止；sharp 画编号框。
- 真实安装测试新增：在真实宿主里配一个本地模拟模型连接，模拟手机轮询回报真实 JPEG，`phone_task` 跑完 done；确认发给模型的最后一条消息是「文字 + 截图」、任务状态和记忆接口正确。
- 未验证：真机上的操作员效果（模型选点是否准、节奏是否自然、各应用的界面节点质量），以及配对页「手机任务」卡片的实际显示。

## 0.5.0 操作限制

- 设置新增「操作限制」：五个类别开关（默认关闭）、禁止打开的应用、额外拦截的按钮文字。操作员按设置生成提示词，并在执行前按元素文字硬拦截（点元素、点坐标、长按、聊天框回车、打开应用、误入被禁应用）。
- 新增测试：关键词匹配（短标签命中、长句不误伤、放开后不拦、自定义词）、禁用应用判定、按坐标找最里层元素、提示词内容、主循环里的四类拦截、设置转换。`bun test external-extension/phone-control` 48 项通过，类型检查与 Biome 通过。

## 0.5.1 拖动与按住拖

- 协议新增 `drag`（起点按住 hold → 沿途经点移动 duration → 终点停 rest 再抬起）；操作员新增 `drag` 动作（元素或坐标到元素或坐标，`hold` 先长按再拖），轨迹为带随机弯度的贝塞尔曲线；在被禁应用里不能拖，起点或终点命中受限文字（如「删除」「卸载」）时拦截；旧版 App 回报不支持时提示升级。直接工具 `phone_control` 同步开放 `drag`。
- 输入前聚焦：只聚焦可编辑元素，聚焦点击同样受按钮文字限制。
- 安卓 0.5.1：用 `continueStroke` 把按住、移动、停留接成同一根手指的连续手势。构建、Lint（No issues found）、单元测试通过；签名证书与 0.4.2 / 0.5.0 相同，可直接覆盖升级。
- `bun test external-extension/phone-control`：60 项通过，类型检查与 Biome 通过。新增覆盖：drag 指令校验与缺省值、拟人拖动的范围和弯度、回答解析、起终点限制、被禁应用、元素不存在、旧版回报、步骤描述、直接工具入队。
- 未验证：真机上的拖动手势效果（滑块、图标拖动、拼图验证）。
- 按住拖的终点停留调整为 550–900ms，移动时长改为 `round(between(500, 800) + d * between(700, 1000))` 并夹到 100–3000ms，等待启动器让位并避免甩动；普通拖动保持原节奏。

## 0.5.2 拖动修正

- 真机反馈：长按淘宝图标拖到起点读书旁边，手势回报成功但图标没动，桌面进入了编辑状态——像是长按之后手指被抬起，移动部分变成了另一次滑动。
- 安卓 0.5.2：不再用 `continueStroke` 分段接续，改成一笔手势一次派发；按住和终点停留用原地 2 像素的来回微动占住时间（系统按路径长度分配时间，微动幅度远小于触摸移动阈值，长按照常触发）。新增 `DragTest`（时间分配、微动幅度、无停留时为普通移动），构建、Lint（No issues found）、单元测试通过。
- 服务端：按住拖放慢移动并在终点悬停 550–900ms 再放手，给桌面让位的时间。`bun test` 61 项通过，类型检查通过。
- 未验证：真机上的拖动效果。
