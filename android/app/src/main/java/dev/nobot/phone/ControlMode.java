package dev.nobot.phone;

/** 未配置或未知值都保持原有无障碍路径，升级不能自动扩大权限。 */
final class ControlMode {
  static final String ACCESSIBILITY = "accessibility", SHIZUKU = "shizuku";
  private ControlMode() {}
  static boolean privileged(String value) { return SHIZUKU.equals(value); }
}
