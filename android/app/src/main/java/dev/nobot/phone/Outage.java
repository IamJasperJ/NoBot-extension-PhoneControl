package dev.nobot.phone;

/**
 * 记录一次断线：从什么时候开始、因为什么，恢复后第一次轮询把它报给服务端。
 * 纯逻辑（时间由调用方传入 elapsedRealtime），便于单元测试。
 * - frozen：两轮循环之间隔了太久——进程被系统挂起 / 冻结了（熄屏后国产系统常见）
 * - network：请求一直失败
 * - paused：手机主人暂停了控制
 * - restarted：无障碍服务或 App 进程重启过
 */
final class Outage {
  /** 两轮循环之间正常最长约 45 秒（退避 15 秒 + 请求超时 18 秒 + 执行指令），超过 60 秒就算被挂起 */
  static final long FROZEN_GAP = 60000;
  /** sleep 超出预期这么久才算被冻结，普通调度抖动不会到这个量级 */
  static final long SLEEP_SLACK = 8000;
  /** 短于 20 秒的断线（偶尔一次请求失败）不上报 */
  static final long MIN_REPORT = 20000;

  static final class Report {
    final long offlineMs;
    final String cause;
    final String error;
    Report(long offlineMs, String cause, String error) { this.offlineMs = offlineMs; this.cause = cause; this.error = error; }
  }

  private long start;
  private String cause = "";
  private String error = "";
  private long lastTick;
  private long lastOk;

  /** 每轮循环开始时调用 */
  void tick(long now) {
    if (lastTick > 0 && now - lastTick > FROZEN_GAP) begin(lastTick, "frozen");
    lastTick = now;
  }

  void failed(long now, String message) {
    // 请求途中被挂起，恢复后才报错：仍算被冻结，从上一轮开始算
    if (lastTick > 0 && now - lastTick > FROZEN_GAP) begin(lastTick, "frozen");
    // 从上次成功算起：一次请求最多卡 18 秒，按失败时刻算会漏掉前面这一大段，反复卡住时永远够不上上报门槛
    begin(lastOk > 0 ? lastOk : now, "network");
    error = message == null ? "" : message.length() > 200 ? message.substring(0, 200) : message;
  }

  /** 请求成功时调用，作为下一次网络断线的起点 */
  void ok(long now) { lastOk = now; }

  /** 轮询间隔的 sleep 明显睡过头：进程被系统冻结了一小会儿（不到 FROZEN_GAP，靠 tick 发现不了） */
  void slept(long started, long now, long expected) {
    if (now - started > expected + SLEEP_SLACK) begin(started, "frozen");
  }

  void paused(long now) { begin(now, "paused"); }

  /** 服务重启：断线从 offlineMs 之前算起 */
  void restarted(long now, long offlineMs) { begin(now - Math.max(0, offlineMs), "restarted"); }

  /** 只记第一个原因：被冻结期间请求失败，根本原因仍是被冻结 */
  private void begin(long at, String reason) {
    if (start != 0) return;
    start = Math.max(1, at);
    cause = reason;
  }

  /** 轮询成功：断线够长就返回要上报的内容并清空，否则只清空 */
  Report succeeded(long now) {
    Report report = start != 0 && now - start >= MIN_REPORT ? new Report(now - start, cause, error) : null;
    start = 0;
    cause = "";
    error = "";
    return report;
  }

  /** 上报那次轮询失败：放回原来的断线（开始时间不变），稍后再报 */
  void restore(long at, String reason, String message) {
    start = Math.max(1, at);
    cause = reason;
    error = message;
  }
}
