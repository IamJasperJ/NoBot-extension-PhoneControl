package dev.nobot.phone;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.IBinder;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * 只关屏幕面板：直接让 SurfaceFlinger 关掉物理屏幕的电源，系统仍认为屏幕亮着、保持解锁，
 * 截图和无障碍操作照常（与 scrcpy「投屏时关闭手机屏幕」相同的做法）。
 * 这些是隐藏接口，只能在 shell / root 身份的进程里调用（Shizuku 用户服务或 su 启动的 app_process），
 * 应用进程里调用会被系统拒绝。
 */
@SuppressLint({"PrivateApi", "DiscouragedPrivateApi", "SoonBlockedPrivateApi", "BlockedPrivateApi"})
final class Panel {
  private Panel() {}

  private static final int POWER_MODE_OFF = 0;
  private static final int POWER_MODE_NORMAL = 2;

  static void set(boolean on) throws Exception {
    Class<?> surface = Class.forName("android.view.SurfaceControl");
    Method mode = surface.getMethod("setDisplayPowerMode", IBinder.class, int.class);
    try {
      for (IBinder token : tokens(surface)) mode.invoke(null, token, on ? POWER_MODE_NORMAL : POWER_MODE_OFF);
    } catch (InvocationTargetException e) {
      throw e.getCause() instanceof Exception ? (Exception) e.getCause() : e;
    }
  }

  /** 所有物理屏幕（折叠屏有两块）的令牌；Android 14 起取令牌的接口从 SurfaceControl 挪到了 DisplayControl。 */
  private static List<IBinder> tokens(Class<?> surface) throws Exception {
    Class<?> source = Build.VERSION.SDK_INT >= 34 ? displayControl() : surface;
    List<IBinder> result = new ArrayList<>();
    try {
      long[] ids = (long[]) source.getMethod("getPhysicalDisplayIds").invoke(null);
      Method token = source.getMethod("getPhysicalDisplayToken", long.class);
      for (long id : ids) {
        IBinder value = (IBinder) token.invoke(null, id);
        if (value != null) result.add(value);
      }
    } catch (NoSuchMethodException e) {
      // 个别 Android 11–13 的定制系统只保留了内置屏接口
      IBinder value = (IBinder) surface.getMethod("getInternalDisplayToken").invoke(null);
      if (value != null) result.add(value);
    }
    if (result.isEmpty()) throw new IllegalStateException("NO_DISPLAY");
    return result;
  }

  /** DisplayControl 在 services.jar 里，需要单独的类加载器并加载 android_servers 原生库。 */
  private static Class<?> displayControl() throws Exception {
    Class<?> factory = Class.forName("com.android.internal.os.ClassLoaderFactory");
    Method create = factory.getDeclaredMethod("createClassLoader", String.class, String.class, String.class,
      ClassLoader.class, int.class, boolean.class, String.class);
    ClassLoader loader = (ClassLoader) create.invoke(null, "/system/framework/services.jar", null, null,
      ClassLoader.getSystemClassLoader(), 0, true, null);
    Class<?> control = loader.loadClass("com.android.server.display.DisplayControl");
    Method load = Runtime.class.getDeclaredMethod("loadLibrary0", Class.class, String.class);
    load.setAccessible(true);
    load.invoke(Runtime.getRuntime(), control, "android_servers");
    return control;
  }

  /** 特权进程回给应用的一行结果：ok 或 error 加原因。 */
  static String reply(Throwable error) { return error == null ? "ok" : "error " + error; }
  /** 解析特权进程的回复，成功返回 null，否则返回错误信息。 */
  static String parse(String line) {
    if (line == null) return "NO_REPLY";
    return line.equals("ok") ? null : line.startsWith("error ") ? line.substring(6) : "BAD_REPLY " + line;
  }
}
