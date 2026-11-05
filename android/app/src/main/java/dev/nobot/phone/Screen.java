package dev.nobot.phone;

/** 收到指令时按屏幕状态决定怎么做；纯逻辑，便于 JVM 单元测试。 */
final class Screen {
  private Screen() {}

  enum Decision { RUN, WAKE, LOCKED, SCREEN_OFF, WAKE_DISABLED }

  /**
   * @param interactive 屏幕亮着
   * @param keyguardShown 锁屏界面在显示（含滑动解锁）
   * @param deviceLocked 需要密码 / 图案 / 指纹才能解锁（Smart Lock 信任时为 false）
   * @param secure 系统是否配置了安全锁屏凭据
   * @param wake 用户允许熄屏时自动亮屏
   */
  static Decision decide(boolean interactive, boolean keyguardShown, boolean deviceLocked, boolean secure, boolean wake) {
    if (interactive && !keyguardShown) return Decision.RUN;
    // 有密码时亮屏也解不开，不白白点亮屏幕
    if (deviceLocked && secure) return Decision.LOCKED;
    if (!wake) return interactive ? Decision.WAKE_DISABLED : Decision.SCREEN_OFF;
    return Decision.WAKE;
  }

  /** 没有锁屏并不等于已经亮屏；必须等实际进入交互状态才能关闭唤醒页面。 */
  static boolean wakeReady(boolean interactive, boolean keyguardShown) {
    return interactive && !keyguardShown;
  }

  /** 超时原因按实际状态分类，不能把后台启动失败或无密码滑动锁屏都说成有密码。 */
  static String wakeFailure(boolean interactive, boolean keyguardShown, boolean deviceLocked, boolean secure, boolean ours) {
    if (deviceLocked && secure) return "DEVICE_LOCKED";
    if (!interactive) return "WAKE_FAILED";
    if (keyguardShown) return "UNLOCK_FAILED";
    return ours ? "CONTROL_APP_VISIBLE" : "WAKE_FAILED";
  }

  /** 熄屏后放慢轮询省电；指令有效期 25 秒，4 秒的延迟可以接受。 */
  static long pollInterval(boolean interactive) { return interactive ? 1500 : 4000; }
}
