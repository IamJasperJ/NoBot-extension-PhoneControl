package dev.nobot.phone;

import java.util.Locale;

/** 检查更新用到的纯逻辑：比较版本号、从 SHA256SUMS.txt 里找文件的摘要。便于单元测试。 */
final class Releases {
  private Releases() {}

  /**
   * 比较两个版本号（可以带 v 前缀，如 v0.5.8 和 0.5.7），返回负数 / 0 / 正数。
   * 按点分隔逐段比较数字；每段只取开头的数字（0.6.0-beta 当作 0.6.0），缺的段当 0。
   */
  static int compare(String a, String b) {
    String[] left = strip(a).split("\\."), right = strip(b).split("\\.");
    for (int i = 0; i < Math.max(left.length, right.length); i++) {
      int diff = Long.compare(number(left, i), number(right, i));
      if (diff != 0) return diff;
    }
    return 0;
  }

  private static String strip(String version) {
    String value = version == null ? "" : version.trim();
    return value.startsWith("v") || value.startsWith("V") ? value.substring(1) : value;
  }

  private static long number(String[] parts, int index) {
    if (index >= parts.length) return 0;
    String part = parts[index];
    int end = 0;
    while (end < part.length() && end < 9 && Character.isDigit(part.charAt(end))) end++;
    return end == 0 ? 0 : Long.parseLong(part.substring(0, end));
  }

  /**
   * sha256sum 的输出（每行「64 位十六进制  文件名」，二进制模式文件名前有 *）里找指定文件的摘要，
   * 找不到或格式不对返回 null；返回小写十六进制。
   */
  static String checksum(String sums, String file) {
    if (sums == null) return null;
    for (String line : sums.split("\\r?\\n")) {
      String[] parts = line.trim().split("\\s+", 2);
      if (parts.length != 2) continue;
      String name = parts[1].startsWith("*") ? parts[1].substring(1) : parts[1];
      if (name.equals(file) && parts[0].matches("(?i)[0-9a-f]{64}")) return parts[0].toLowerCase(Locale.ROOT);
    }
    return null;
  }

  /** 发版产物里的 APK 名：nobot-phone-<版本>.apk */
  static boolean isApk(String name) {
    return name != null && name.startsWith("nobot-phone-") && name.endsWith(".apk");
  }
}
