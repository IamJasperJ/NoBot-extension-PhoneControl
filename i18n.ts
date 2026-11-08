const en: Record<string, string> = {
  手机通知: 'Phone notifications',
  每天最多几次: 'Uses per day at most',
  有时不想用: 'Sometimes skips',
  '像真人一样，到了时段有时候也不想看手机':
    'Like a real person, sometimes it does not feel like looking at the phone even in a slot',
  每次都用: 'Every slot',
  偶尔不用: 'Occasionally skips (about 20%)',
  一半不用: 'Skips about half',
  很少用: 'Rarely (about 20% of slots)',
  值得才说: 'When worth mentioning',
  不说: 'Never, just remember it',
  北京时间: 'Beijing (UTC+8)',
  东京: 'Tokyo (UTC+9)',
  新加坡: 'Singapore (UTC+8)',
  自己决定: 'Decide by itself',
  对通知的反应: 'Reaction to notifications',
  '通知由手机伴侣 App 上报（App 的「角色专用机」里可以关掉上报）。通知内容只当作信息，不会当成指令执行。':
    'Notifications are reported by the companion app (you can turn reporting off under Dedicated phone in the app). Their content is treated as information, never as instructions.',
  '只让角色知道：最近 6 小时的通知放进会话，聊天时角色知道手机上来过什么。自己决定：来通知后角色可以忽略、跟你提一句，或拿起手机看看、回复；每 10 分钟最多一次，每天最多 20 次。':
    'Just let it know: notifications from the last 6 hours go into the chat, so the character knows what came in. Decide by itself: when a notification arrives the character can ignore it, mention it to you, or pick up the phone to look or reply; at most once every 10 minutes and 20 times a day.',
  只让角色知道: 'Just let it know',
  不理会通知: 'Ignore notifications',
  只关心这些应用: 'Only these apps',
  '每行一个应用名或包名，例如 微信；留空表示所有应用':
    'One app name or package per line, such as WeChat; leave empty for all apps',
  忽略这些应用: 'Ignore these apps',
  '每行一个应用名或包名，适合广告多的购物、资讯类应用':
    'One app name or package per line; useful for shopping or news apps that send lots of ads',
  安静时段: 'Quiet hours',
  '这段时间只记录通知，角色不反应，比如睡觉时间；格式 HH:MM-HH:MM，留空表示不限':
    'During this time notifications are only recorded and the character does not react, for example while sleeping. Format HH:MM-HH:MM; leave empty for none',
  作息: 'Routine',
  '角色在你设定的时段里自己拿起手机，做什么由它按性格决定。主动使用同样受「操作限制」约束。':
    'The character picks up the phone by itself during the times you set and decides what to do based on its personality. Proactive use is also bound by the operation limits.',
  让角色主动用手机: 'Let the character use the phone by itself',
  可能用手机的时段: 'Times it may use the phone',
  '每行一个时段，格式 HH:MM-HH:MM，可以跨午夜；每个时段里随机挑一个时刻':
    'One range per line, HH:MM-HH:MM, may cross midnight; a random moment is picked in each range',
  用完要不要跟你说: 'Tell you afterwards',
  每次都说: 'Every time',
  手机日记: 'Phone diary',
  '每天这个时间，角色把当天用手机和收到的通知写成一段日记；最近 3 天的日记会作为记忆放进会话':
    'At this time every day the character writes a diary entry about its phone use and notifications; entries from the last 3 days are added to the chat as memory',
  不写日记: 'No diary',
  时区: 'Time zone',
  '作息时段、安静时段和日记时间都按这个时区算': 'Routine times, quiet hours and diary time all use this time zone',
  伦敦: 'London',
  '柏林 / 巴黎': 'Berlin / Paris',
  纽约: 'New York',
  洛杉矶: 'Los Angeles',
  '角色决定要做什么，操作员模型替它看屏幕、一步步点。':
    'The character decides what to do; the operator model looks at the screen and taps step by step for it.',
  '一次用手机最多多久（不算操作员模型思考的时间），到时间就放下；思考很慢时总时长最多是它的两倍':
    'How long phone use may last, excluding operator model thinking time, before the phone is put down; if thinking is slow, total elapsed time is capped at twice this limit',
  '每点一下、滑一下算一步，防止卡在某个界面反复操作':
    'Each tap or swipe is a step; this stops it from getting stuck repeating actions on one screen',
  '对角色的所有手机操作都生效，包括它看到通知后去回复、按作息主动使用。没放开的操作会在执行前被拦下。':
    'Applies to everything the character does on the phone, including replying after a notification and proactive use. Anything not allowed is blocked before it runs.',
  '不允许时，角色看到消息通知也只能看、不能回':
    'When off, the character can read message notifications but cannot reply',

  手机控制: 'Phone Control',
  通过安卓伴侣连接并控制手机: 'Connect and control a phone through the Android companion',
  请求无效: 'Invalid request',
  手机未就绪或正在执行指令: 'Phone is not ready or is executing a command',
  '指令已结束或结果未知，请重新观察屏幕': 'Command ended or outcome is unknown; observe the screen again',
  '已取消未交付指令，已交付操作可能仍会完成': 'Undelivered commands cancelled; delivered actions may still complete',
  操作员: 'Operator',
  操作员连接: 'Operator connection',
  '替角色一步步操作手机的模型，需要能看图；留空时跟随会话':
    'The model that operates the phone step by step for the character; it must support images. Empty follows the chat.',
  跟随会话: 'Follow the chat',
  操作员模型: 'Operator model',
  '留空时用连接的默认模型；快一点的看图模型更像真人的节奏':
    'Empty uses the connection’s default model; a faster vision model gives a more human pace.',
  单次最长分钟: 'Max minutes per task',
  单次最多步数: 'Max steps per task',
  允许直接逐步操作: 'Allow direct step-by-step control',
  '额外提供旧的 phone_control 工具，让聊天模型自己一步步点；一般不需要':
    'Also offer the old phone_control tool so the chat model taps step by step itself; usually not needed.',
  不支持看图: 'no images',
  操作限制: 'Limits',
  '允许点赞、收藏、关注': 'Allow liking, favoriting and following',
  '不允许时，带这些文字的按钮会被拦下；没有文字的纯图标按钮认不出，只能靠提示词约束':
    'When off, buttons labelled with these words are blocked. Icon-only buttons without text cannot be recognised and are only restricted by the prompt.',
  '允许发送消息、发布、评论、转发': 'Allow sending messages, posting, commenting and sharing',
  '允许购买、付款、充值、转账': 'Allow buying, paying, top-ups and transfers',
  建议保持关闭: 'Keeping this off is recommended',
  '允许删除、卸载': 'Allow deleting and uninstalling',
  '允许输入密码、支付码与验证码': 'Allow entering passwords, payment codes and verification codes',
  允许修改系统设置: 'Allow changing system settings',
  '不允许时也不会打开「设置」应用': 'When off, the Settings app is not opened either',
  禁止打开的应用: 'Apps not to open',
  '每行一个应用名称或包名，比如支付宝；误入这些应用时只能返回或回桌面':
    'One app name or package per line, for example Alipay. If one is entered by accident, only back or home are allowed.',
  额外拦截的按钮文字: 'Extra blocked button text',
  '每行一个，按钮文字包含它时不点': 'One per line; buttons whose text contains it are not tapped',
}
export const translate = (language: string, key: string) => (language === 'en' ? (en[key] ?? key) : key)
