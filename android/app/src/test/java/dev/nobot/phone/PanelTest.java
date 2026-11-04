package dev.nobot.phone;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class PanelTest {
  @Test public void replyProtocol() {
    // Root 进程每条指令回一行：ok 或 error 加原因
    assertEquals("ok", Panel.reply(null));
    assertNull(Panel.parse(Panel.reply(null)));
    assertEquals("java.lang.IllegalStateException: NO_DISPLAY", Panel.parse(Panel.reply(new IllegalStateException("NO_DISPLAY"))));
    assertEquals("NO_REPLY", Panel.parse(null));
    assertEquals("BAD_REPLY su: denied", Panel.parse("su: denied"));
  }
}
