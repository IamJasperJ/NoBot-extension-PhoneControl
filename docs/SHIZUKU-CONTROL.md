# Shizuku 高权限控制模式（0.6.0 分支版）

## 启用与恢复旧方式

1. 手机端和服务端插件一起更新到本分支构建的版本。
2. 在手机启动 Shizuku，并向 NoBot Phone 授权。非 Root 启动的 Shizuku 在手机重启后需要重新启动。
3. 保持无障碍服务开启：本版仍由 PhoneService 承载设备连接、轮询、前台通知和断线记录。
4. 在手机主页「控制方式」选择「Shizuku 高权限」。切换会暂停控制，需要重新点开始。
5. 暂停状态下可点「检测 Shizuku 控制服务」，确认能够建立系统自动化连接。这不代表所有输入和截图能力都已通过真机验证。
6. 「熄屏使用」继续选择亮屏解锁或只关屏幕面板。高权限控制模式下，面板通道使用 Shizuku；原来的 Root 来源设置保留给旧模式。
7. 随时切回「无障碍（原有方式）」并重新开始。旧模式仍是安装及升级的默认值，不会自动扩大权限。

## 执行方式

| 能力 | 无障碍原有模式 | Shizuku 高权限模式 |
| --- | --- | --- |
| 点击、长按、滑动、拖动 | dispatchGesture | shell UiAutomation 注入连续 DOWN / MOVE / UP，取消时 CANCEL |
| 截图 | 无障碍截图接口 | shell UiAutomation 截图，结果经文件描述符管道返回 |
| 返回、主页、最近任务 | 无障碍全局动作 | 系统按键事件 |
| 唤醒及无密码解锁 | UnlockActivity | WAKEUP 按键及固定的 wm dismiss-keyguard 命令 |
| 启动应用 | 应用进程 startActivity | shell 身份固定参数启动指定应用 |
| 读取界面、输入文字、回车 | 无障碍界面树动作 | UiAutomation 界面树动作；不替换输入法、不复制密码到剪贴板 |
| 列出启动器应用 | PackageManager | 保留同一只读 PackageManager 路径 |
| 黑屏和手动解除 | 原有 Panel / PanelSession | 同一任务黑屏状态机，面板权限固定为 Shizuku |

中文、表情及替换已有内容仍通过系统的可编辑节点完成。因此自绘输入框不一定支持输入；Shizuku 不等于通用输入法或 Root，也不解开真正的密码锁屏、不解除受保护截图。其他自动化工具若占用了系统 UiAutomation 会话，需要先退出。

本版没有迁移网络轮询到特权进程，也没有去掉无障碍服务入口。升级的范围是执行后端，既有配对、手机任务、权限限制、更新、断线记录和黑屏规则继续使用。

## 失败和取消

- `SHIZUKU_UNAVAILABLE`：Shizuku 未运行、连接丢失或版本不支持。
- `SHIZUKU_PERMISSION_REQUIRED`：没有获得 Shizuku 授权。
- `SHIZUKU_CONTROL_FAILED`：特权接口、输入注入或连接失败；部分动作可能已发生，不自动重试或切换后端。
- `SHIZUKU_TIMEOUT`：特权请求超时，暂停控制；检查手机当前状态后再继续。
- 暂停、重新配对、切换控制方式会更换本地动作代号，取消排队操作和持续手势。已经完成的点击不能撤销。
- 每次特权请求最多 8.5 秒，服务端管道结果上限 3 MB。高权限模式单条设备指令等待上限为 20 秒（仍受指令 TTL 约束），旧模式保持 10 秒。
- 内部 `probe` / `wake` 不加入外部模型动作协议；服务只接受固定动作，不提供任意 shell 命令接口。

## 真机验收

目前没有连接真机；JVM 测试和编译无法代替以下验收：

1. 旧模式：观察、点击、中文输入、拖动、黑屏、Root 面板来源继续可用。
2. 高权限：检测服务成功；观察获取截图和节点；返回/主页/最近任务正常。
3. 新任务从熄屏状态唤醒；无密码滑动锁屏可解除；真实密码锁屏仍停止。
4. 打开目标应用、输入中文和表情、搜索；密码输入开关仍生效。
5. 长按拖动图标到另一位置，手指不提前抬起；拖动中暂停不残留按下状态。
6. 高权限黑屏时截图和触摸有效；电源键解除后同轮不再黑屏，下轮重新黑屏。
7. 中途停止 Shizuku、撤销授权或切换旧模式：没有动作重放，错误明确。
8. 旋转屏幕后坐标和截图一致；服务重启后由用户重新开始控制。

## 参考

- [Shizuku UserService 与权限说明](https://github.com/RikkaApps/Shizuku-API)
- [Android UiAutomation](https://developer.android.com/reference/android/app/UiAutomation)
- [AOSP UiAutomationConnection](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/UiAutomationConnection.java)
