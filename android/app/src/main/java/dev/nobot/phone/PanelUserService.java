package dev.nobot.phone;

import android.os.IBinder;
import android.os.RemoteException;

/** Shizuku 用户服务：Shizuku 以 shell 身份启动这个类，应用通过 IPanel 调用它关 / 开面板。 */
public class PanelUserService extends IPanel.Stub {
  public PanelUserService() {}

  @Override public void destroy() { restore(); System.exit(0); }

  @Override public String setPanel(boolean on) {
    try { Panel.set(on); return ""; } catch (Throwable e) { return String.valueOf(e); }
  }

  @Override public void attach(IBinder client) throws RemoteException {
    // 应用进程被杀时不能把屏幕留在全黑状态
    client.linkToDeath(() -> { restore(); System.exit(0); }, 0);
  }

  private static void restore() {
    try { Panel.set(true); } catch (Throwable ignored) {}
  }
}
