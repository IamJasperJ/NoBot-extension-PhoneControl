package dev.nobot.phone;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DragTest {
  @Test public void holdAndRestTakeTheirShareOfTime() {
    // 从 (100,100) 移到 (100,700)，移动 600 像素用 500 毫秒；按住 800、停 600
    float[] track = Drag.path(100, 100, new float[]{100, 400, 100, 700}, 800, 500, 600);
    float speed = 600f / 500;
    // 系统按长度分配时间：总长度应等于 速度 × 总时长
    assertEquals(speed * (800 + 500 + 600), Drag.length(track), 1f);
    assertEquals(100f, track[0], 0f);
    assertEquals(100f, track[1], 0f);
    // 终点停在 (100,700)
    assertEquals(100f, track[track.length - 2], 0f);
    assertEquals(700f, track[track.length - 1], 0f);
  }

  @Test public void wiggleStaysWithinTouchSlop() {
    float[] track = Drag.path(300, 300, new float[]{900, 300}, 2000, 100, 1000);
    // 按住阶段（移动开始前）离起点不超过几像素
    for (int i = 0; i + 1 < track.length; i += 2) {
      if (track[i] > 320) break;
      assertTrue(Math.abs(track[i] - 300) <= Drag.WIGGLE * 2 && track[i + 1] == 300);
    }
  }

  @Test public void noHoldNoRestIsPlainMove() {
    float[] track = Drag.path(0, 0, new float[]{30, 40}, 0, 200, 0);
    assertEquals(4, track.length);
    assertEquals(50f, Drag.length(track), 0.01f);
  }
}
