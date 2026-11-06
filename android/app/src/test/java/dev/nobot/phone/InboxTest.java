package dev.nobot.phone;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class InboxTest {
  private static Inbox.Entry entry(long at, String text) { return new Inbox.Entry(at, "com.tencent.mm", "微信", "小明", text); }

  @Test public void sameNotificationWithinTenMinutesIsRecordedOnce() {
    Inbox inbox = new Inbox();
    assertTrue(inbox.add(entry(0, "吃饭吗")));
    assertFalse(inbox.add(entry(60_000, "吃饭吗")));
    assertTrue(inbox.add(entry(60_000, "在吗")));
    // 10 分钟后同样的内容算新的一条
    assertTrue(inbox.add(entry(Inbox.REPEAT_WINDOW, "吃饭吗")));
    assertEquals(3, inbox.size());
  }

  @Test public void emptyNotificationsAreIgnored() {
    Inbox inbox = new Inbox();
    assertFalse(inbox.add(new Inbox.Entry(0, "com.a", "A", " ", "")));
    assertFalse(inbox.add(new Inbox.Entry(0, "", "A", "t", "x")));
    assertEquals(0, inbox.size());
  }

  @Test public void keepsAtMostFiftyAndSendsTwentyAtATime() {
    Inbox inbox = new Inbox();
    for (int i = 0; i < 60; i++) inbox.add(entry(i, "m" + i));
    assertEquals(Inbox.CAPACITY, inbox.size());
    List<Inbox.Entry> batch = inbox.batch();
    assertEquals(Inbox.BATCH, batch.size());
    // 超出容量丢最旧的
    assertEquals("m10", batch.get(0).text);
    inbox.add(entry(100, "new"));
    inbox.ack(batch);
    assertEquals(31, inbox.size());
    assertEquals("m30", inbox.batch().get(0).text);
  }

  @Test public void truncatesLongFields() {
    Inbox.Entry e = new Inbox.Entry(0, "p", "a".repeat(150), "t", "x".repeat(1500));
    assertEquals(100, e.app.length());
    assertEquals(1000, e.text.length());
  }

  @Test public void restoredEntriesStillDeduplicate() {
    Inbox inbox = new Inbox();
    inbox.restore(List.of(entry(0, "吃饭吗")));
    assertFalse(inbox.add(entry(1000, "吃饭吗")));
    assertEquals(1, inbox.size());
  }
}
