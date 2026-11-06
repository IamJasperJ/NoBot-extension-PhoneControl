package dev.nobot.phone;

import java.util.concurrent.atomic.AtomicLong;

/** 单条动作的取消代号；暂停后排队动作和正在进行的长按都不能继续。 */
final class ControlLease {
  private final AtomicLong generation = new AtomicLong();
  long ticket() { return generation.get(); }
  void cancel() { generation.incrementAndGet(); }
  boolean valid(long ticket, long deadline, long now) { return failure(ticket, deadline, now) == null; }
  String failure(long ticket, long deadline, long now) {
    if (ticket != generation.get()) return "CANCELLED";
    return now >= deadline ? "SHIZUKU_TIMEOUT" : null;
  }
}
