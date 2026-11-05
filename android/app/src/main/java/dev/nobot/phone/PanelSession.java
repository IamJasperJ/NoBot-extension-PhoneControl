package dev.nobot.phone;

/** 每轮任务独立记录黑屏意图；手动解除只影响本轮，不能被下一条指令覆盖。 */
final class PanelSession {
  private String taskId;
  private boolean requested;

  synchronized void begin(String id, boolean panelMode) {
    if (!id.equals(taskId)) {
      taskId = id;
      requested = panelMode;
    }
    if (!panelMode) requested = false;
  }

  synchronized boolean requested() { return requested; }
  synchronized void release() { requested = false; }
  synchronized void hold() { requested = true; }
}
