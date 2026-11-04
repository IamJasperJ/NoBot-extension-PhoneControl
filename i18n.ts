const en: Record<string, string> = {
  手机控制: 'Phone Control',
  通过安卓伴侣连接并控制手机: 'Connect and control a phone through the Android companion',
  '允许使用手机的会话 ID': 'Chat ID allowed to control the phone',
  留空时不向模型提供手机工具: 'Leave empty to disable phone tools for models',
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
}
export const translate = (language: string, key: string) => (language === 'en' ? (en[key] ?? key) : key)
