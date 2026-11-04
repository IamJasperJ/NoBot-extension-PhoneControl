package dev.nobot.phone;

// 运行在 Shizuku（shell 身份）进程里的屏幕面板控制服务
interface IPanel {
  // Shizuku 约定的销毁方法，解绑时调用
  void destroy() = 16777114;
  // 关 / 开屏幕面板；成功返回空字符串，失败返回错误信息
  String setPanel(boolean on) = 1;
  // 传入应用进程的令牌：应用进程退出时恢复面板并结束服务
  void attach(IBinder client) = 2;
}
