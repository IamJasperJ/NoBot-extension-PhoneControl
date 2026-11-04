package dev.nobot.phone;

import static org.junit.Assert.assertEquals;

import dev.nobot.phone.Screen.Decision;
import org.junit.Test;

public class ScreenTest {
  @Test public void decide() {
    // 亮屏已解锁：直接执行
    assertEquals(Decision.RUN, Screen.decide(true, false, false, true));
    assertEquals(Decision.RUN, Screen.decide(true, false, false, false));
    // 熄屏、无密码：允许时亮屏解锁，不允许时报熄屏
    assertEquals(Decision.WAKE, Screen.decide(false, true, false, true));
    assertEquals(Decision.WAKE, Screen.decide(false, false, false, true));
    assertEquals(Decision.SCREEN_OFF, Screen.decide(false, true, false, false));
    // 亮屏但停在滑动锁屏
    assertEquals(Decision.WAKE, Screen.decide(true, true, false, true));
    assertEquals(Decision.LOCKED, Screen.decide(true, true, false, false));
    // 有密码：无论开关都不亮屏
    assertEquals(Decision.LOCKED, Screen.decide(false, true, true, true));
    assertEquals(Decision.LOCKED, Screen.decide(true, true, true, true));
  }

  @Test public void pollSlowerWhenOff() {
    assertEquals(1500, Screen.pollInterval(true));
    assertEquals(4000, Screen.pollInterval(false));
  }
}
