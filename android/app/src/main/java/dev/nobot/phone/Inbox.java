package dev.nobot.phone;

import java.util.ArrayList;
import java.util.List;

/**
 * 待上报的手机通知（见 PROTOCOL.md「0.7.0 手机通知」）：同一应用相同标题和正文 10 分钟内只记一次，
 * 最多缓存 50 条（超出丢最旧的），每次轮询最多带 20 条，服务端收到（HTTP 200）后再删。
 * 纯逻辑，时间由调用方传入，便于单元测试；持久化由 PhoneService 负责。
 */
final class Inbox {
  static final int CAPACITY = 50, BATCH = 20;
  static final long REPEAT_WINDOW = 10 * 60_000L;

  static final class Entry {
    final long at;
    final String pkg, app, title, text;
    Entry(long at, String pkg, String app, String title, String text) {
      this.at = at;
      this.pkg = cut(pkg, 200);
      this.app = cut(app, 100);
      this.title = cut(title, 200);
      this.text = cut(text, 1000);
    }
    String key() { return pkg + '\n' + title + '\n' + text; }
  }

  private final List<Entry> pending = new ArrayList<>();
  /** 最近记过的通知（含已上报的），用于 10 分钟去重 */
  private final List<Entry> recent = new ArrayList<>();

  /** 记一条通知；重复或没有内容时返回 false */
  synchronized boolean add(Entry entry) {
    if (entry.pkg.isEmpty() || (entry.title.isEmpty() && entry.text.isEmpty())) return false;
    recent.removeIf(e -> entry.at - e.at >= REPEAT_WINDOW || e.at > entry.at);
    for (Entry e : recent) if (e.key().equals(entry.key())) return false;
    recent.add(entry);
    pending.add(entry);
    while (pending.size() > CAPACITY) pending.remove(0);
    return true;
  }

  /** 本次轮询要带的通知（最早的若干条） */
  synchronized List<Entry> batch() { return new ArrayList<>(pending.subList(0, Math.min(BATCH, pending.size()))); }

  /** 服务端已收到 sent：只删这些条目（期间新来的保留） */
  synchronized void ack(List<Entry> sent) { pending.removeAll(sent); }

  synchronized List<Entry> all() { return new ArrayList<>(pending); }

  synchronized void clear() { pending.clear(); recent.clear(); }

  synchronized int size() { return pending.size(); }

  /** 进程重启后从持久化恢复；恢复的条目也参与去重 */
  synchronized void restore(List<Entry> entries) {
    pending.clear();
    for (Entry e : entries) if (pending.size() < CAPACITY) pending.add(e);
    recent.clear();
    recent.addAll(pending);
  }

  private static String cut(String value, int max) {
    String text = value == null ? "" : value.trim();
    return text.length() > max ? text.substring(0, max) : text;
  }
}
