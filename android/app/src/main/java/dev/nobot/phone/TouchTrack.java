package dev.nobot.phone;

/** 原始触摸按时间采样：按住期间不移动，移动按路径长度分配，停留期间不抬手。 */
final class TouchTrack {
  private final float[] points;
  private final double[] lengths;
  final int hold, duration, rest;

  TouchTrack(float[] points, int hold, int duration, int rest) {
    if (points.length < 4 || points.length % 2 != 0 || points.length > 36
        || hold < 0 || hold > 2000 || duration < 1 || duration > 3000 || rest < 0 || rest > 1000)
      throw new IllegalArgumentException("INVALID_INPUT");
    this.points = points.clone();
    this.hold = hold; this.duration = duration; this.rest = rest;
    lengths = new double[points.length / 2];
    for (int i = 0; i < points.length; i++) if (!Float.isFinite(points[i])) throw new IllegalArgumentException("INVALID_INPUT");
    for (int i = 1; i < lengths.length; i++)
      lengths[i] = lengths[i - 1] + Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1]);
  }

  int total() { return hold + duration + rest; }

  float[] at(long elapsed) {
    if (elapsed <= hold) return new float[]{points[0], points[1]};
    if (elapsed >= hold + duration) return new float[]{points[points.length - 2], points[points.length - 1]};
    double distance = lengths[lengths.length - 1] * (elapsed - hold) / duration;
    for (int i = 1; i < lengths.length; i++) {
      if (distance > lengths[i]) continue;
      double segment = lengths[i] - lengths[i - 1];
      double ratio = segment == 0 ? 0 : (distance - lengths[i - 1]) / segment;
      return new float[]{(float) (points[i * 2 - 2] + (points[i * 2] - points[i * 2 - 2]) * ratio),
        (float) (points[i * 2 - 1] + (points[i * 2 + 1] - points[i * 2 - 1]) * ratio)};
    }
    return new float[]{points[points.length - 2], points[points.length - 1]};
  }

  static float coordinate(double unit, int size) {
    if (!Double.isFinite(unit) || unit < 0 || unit > 1 || size < 1) throw new IllegalArgumentException("INVALID_INPUT");
    return (float) (unit * (size - 1));
  }
}
