package dev.nobot.phone;

import java.util.ArrayList;
import java.util.List;

/**
 * 拖动手势的轨迹（像素坐标），做成一笔连续的手势。
 * 系统按路径长度平均分配一笔手势的时间，没法直接「先停住再走」；之前用 continueStroke 分段接续，
 * 真机（HyperOS 桌面）上长按后图标没跟着走，像是段与段之间手指被抬起了。
 * 现在在起点和终点原地来回微动（幅度 2 像素，远小于触摸判定的移动阈值），用这段长度「买」出停留时间：
 * 系统看到的仍是按住不动，长按照常触发，整个过程只派发一次。
 */
final class Drag {
  /** 原地微动的幅度（像素） */
  static final float WIGGLE = 2f;
  /** 微动折返次数上限，避免极端参数下路径过长 */
  static final int MAX_WIGGLES = 30000;

  private Drag() {}

  /**
   * 生成整笔轨迹：起点微动 hold 毫秒 → 依次经过 points 到终点（用 duration 毫秒）→ 终点微动 rest 毫秒。
   * points 是途经点和终点，不含起点。返回 [x0, y0, x1, y1, ...]，第一个点是起点。
   */
  static float[] path(float x, float y, float[] points, int hold, int duration, int rest) {
    float length = 0, lastX = x, lastY = y;
    for (int i = 0; i + 1 < points.length; i += 2) {
      length += (float) Math.hypot(points[i] - lastX, points[i + 1] - lastY);
      lastX = points[i]; lastY = points[i + 1];
    }
    // 起点终点重合时按 1 像素/毫秒算，仍能得到正确的停留比例
    float speed = length > 0 ? length / duration : 1f;
    List<Float> out = new ArrayList<>();
    out.add(x); out.add(y);
    wiggle(out, x, y, speed * hold);
    for (float p : points) out.add(p);
    wiggle(out, lastX, lastY, speed * rest);
    float[] result = new float[out.size()];
    for (int i = 0; i < result.length; i++) result[i] = out.get(i);
    return result;
  }

  /** 在 (x, y) 附近来回走够 distance 的路程（每次去或回 WIGGLE 像素），最后回到原点 */
  private static void wiggle(List<Float> out, float x, float y, float distance) {
    if (distance <= 0) return;
    int count = (int) Math.min(MAX_WIGGLES, Math.ceil(distance / WIGGLE));
    if (count % 2 == 1) count++;
    float step = distance / count;
    for (int i = 0; i < count; i++) {
      out.add(i % 2 == 0 ? x + step : x);
      out.add(y);
    }
  }

  /** 轨迹总长度（测试用） */
  static float length(float[] path) {
    float total = 0;
    for (int i = 2; i + 1 < path.length; i += 2) total += (float) Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
    return total;
  }
}
