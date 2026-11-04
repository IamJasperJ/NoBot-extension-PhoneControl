const en: Record<string, string> = {
  手机控制: 'Phone Control',
  通过安卓伴侣连接并控制手机: 'Connect and control a phone through the Android companion',
  '允许使用手机的会话 ID': 'Chat ID allowed to control the phone',
  留空时不向模型提供手机工具: 'Leave empty to disable phone tools for models',
  请求无效: 'Invalid request',
  手机未就绪或正在执行指令: 'Phone is not ready or is executing a command',
  '指令已结束或结果未知，请重新观察屏幕': 'Command ended or outcome is unknown; observe the screen again',
  '已取消未交付指令，已交付操作可能仍会完成': 'Undelivered commands cancelled; delivered actions may still complete',
}
export const translate = (language: string, key: string) => (language === 'en' ? (en[key] ?? key) : key)
