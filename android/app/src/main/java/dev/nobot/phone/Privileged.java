package dev.nobot.phone;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import rikka.shizuku.Shizuku;

/**
 * 应用进程里的特权通道：经 Shizuku 用户服务或 Root（su 启动的 app_process）关 / 开屏幕面板。
 * 全部是阻塞调用，不能在主线程用。
 */
final class Privileged {
  static final String SHIZUKU = "shizuku", ROOT = "root";
  /** 检查结果：null 表示可用，否则是 strings.xml 里的提示 */
  static final class Unavailable extends Exception {
    final int message;
    Unavailable(int message) { super(String.valueOf(message)); this.message = message; }
  }

  private final Context context;
  private final SharedPreferences prefs;
  private final ExecutorService reader = Executors.newSingleThreadExecutor();
  private String source;
  // Shizuku
  private IPanel service;
  private ServiceConnection connection;
  private Shizuku.UserServiceArgs args;
  private final Binder token = new Binder();
  // Root
  private Process root;
  private OutputStream rootIn;
  private BufferedReader rootOut;

  Privileged(Context context) {
    this.context = context.getApplicationContext();
    prefs = context.getSharedPreferences("bridge", Context.MODE_PRIVATE);
  }

  /**
   * 当前配置的权限来源是否可用；Shizuku 未授权时由界面去申请。
   * Shizuku 在 App 进程状态变化时才把接口发过来，刚启动时可能晚一点到，最多等 3 秒。会阻塞，不能在主线程调用。
   */
  static void check(String source) throws Unavailable {
    if (SHIZUKU.equals(source)) {
      for (int i = 0; i < 30 && !Shizuku.pingBinder(); i++) {
        try { Thread.sleep(100); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
      }
      if (!Shizuku.pingBinder()) throw new Unavailable(R.string.shizuku_not_running);
      if (Shizuku.isPreV11()) throw new Unavailable(R.string.shizuku_too_old);
      if (Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) throw new Unavailable(R.string.shizuku_permission);
    }
  }

  /** 关 / 开屏幕面板，失败抛异常；首次使用 Root 时 su 可能弹授权框，给足等待时间。 */
  synchronized void set(boolean on) throws Exception {
    String wanted = prefs.getString("privilege", SHIZUKU);
    if (!wanted.equals(source)) close();
    source = wanted;
    if (SHIZUKU.equals(source)) {
      check(source);
      String error = shizuku().setPanel(on);
      if (!error.isEmpty()) throw new IllegalStateException(error);
    } else {
      startRoot();
      rootIn.write((on ? "on\n" : "off\n").getBytes(StandardCharsets.UTF_8));
      rootIn.flush();
      Future<String> line = reader.submit(rootOut::readLine);
      String error;
      try { error = Panel.parse(line.get(20, TimeUnit.SECONDS)); }
      catch (Exception e) { line.cancel(true); close(); throw new Unavailable(R.string.root_denied); }
      if (error != null) throw new IllegalStateException(error);
    }
  }

  private IPanel shizuku() throws Exception {
    if (service != null && service.asBinder().pingBinder()) return service;
    CountDownLatch ready = new CountDownLatch(1);
    args = new Shizuku.UserServiceArgs(new ComponentName(context, PanelUserService.class))
      .daemon(false).processNameSuffix("panel").version(BuildConfig.VERSION_CODE).debuggable(BuildConfig.DEBUG);
    connection = new ServiceConnection() {
      @Override public void onServiceConnected(ComponentName name, IBinder binder) {
        service = IPanel.Stub.asInterface(binder);
        ready.countDown();
      }
      @Override public void onServiceDisconnected(ComponentName name) { service = null; }
    };
    Shizuku.bindUserService(args, connection);
    if (!ready.await(10, TimeUnit.SECONDS) || service == null) throw new Unavailable(R.string.shizuku_not_running);
    service.attach(token);
    return service;
  }

  private void startRoot() throws Exception {
    if (root != null && root.isAlive()) return;
    try { root = new ProcessBuilder("su").start(); }
    catch (Exception e) { throw new Unavailable(R.string.root_denied); }
    rootIn = root.getOutputStream();
    rootOut = new BufferedReader(new InputStreamReader(root.getInputStream(), StandardCharsets.UTF_8));
    // exec 让 app_process 接管 su 的标准输入：应用进程退出、管道关闭时它会恢复面板再退出
    String apk = context.getApplicationInfo().sourceDir;
    rootIn.write(("CLASSPATH='" + apk + "' exec app_process /system/bin " + PanelServer.class.getName() + "\n").getBytes(StandardCharsets.UTF_8));
    rootIn.flush();
  }

  /** 断开特权进程；它们会在断开时自行恢复面板。 */
  synchronized void close() {
    if (connection != null) {
      try { Shizuku.unbindUserService(args, connection, true); } catch (Exception ignored) {}
      connection = null;
      service = null;
    }
    if (root != null) {
      try { rootIn.close(); } catch (Exception ignored) {}
      root.destroy();
      root = null;
    }
  }
}
