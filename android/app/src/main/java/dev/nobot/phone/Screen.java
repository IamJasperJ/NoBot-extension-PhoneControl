package dev.nobot.phone;

/** 收到指令时按屏幕状态决定怎么做；纯逻辑，便于 JVM 单元测试。 */
final class Screen {
  private Screen() {}

  enum Decision { RUN, WAKE, LOCKED, SCREEN_OFF }

  /**
   * @param interactive 屏幕亮着
   * @param keyguardShown 锁屏界面在显示（含滑动解锁）
   * @param deviceLocked 需要密码 / 图案 / 指纹才能解锁（Smart Lock 信任时为 false）
   * @param wake 用户允许熄屏时自动亮屏
   */
  static Decision decide(boolean interactive, boolean keyguardShown, boolean deviceLocked, boolean wake) {
    if (interactive && !keyguardShown) return Decision.RUN;
    // 有密码时亮屏也解不开，不白白点亮屏幕
    if (deviceLocked) return Decision.LOCKED;
    if (!wake) return interactive ? Decision.LOCKED : Decision.SCREEN_OFF;
    return Decision.WAKE;
  }

  /** 熄屏后放慢轮询省电；指令有效期 25 秒，4 秒的延迟可以接受。 */
  static long pollInterval(boolean interactive) { return interactive ? 1500 : 4000; }
}
