package dev.nobot.phone;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.UiAutomation;
import android.graphics.Bitmap;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Display;
import android.view.InputDevice;
import android.view.InputEvent;
import java.lang.reflect.Method;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 在 shell 身份的用户服务中使用系统 UiAutomation：原始输入事件和截图由系统执行，
 * 节点与文字编辑仍用系统提供的界面树能力，不改变用户的输入法，也不往剪贴板写入密码。
 */
final class ShellControl {
  interface Guard { void check(); }
  private UiAutomation ui;
  private HandlerThread callbacks;
  private Method injectWithoutAnimation;

  static JSONObject result(boolean ok, String code) {
    JSONObject result = new JSONObject();
    try { result.put("ok", ok).put("code", code); } catch (Exception ignored) {}
    return result;
  }

  private void connect() throws Exception {
    if (ui != null) return;
    callbacks = new HandlerThread("nobot-control-callbacks");
    callbacks.start();
    try {
      Class<?> connection = Class.forName("android.app.IUiAutomationConnection");
      Object binder = Class.forName("android.app.UiAutomationConnection").getConstructor().newInstance();
      ui = (UiAutomation) UiAutomation.class.getConstructor(Looper.class, connection).newInstance(callbacks.getLooper(), binder);
      // 否则系统会暂停所有普通无障碍服务，包括承载现有轮询的 PhoneService。
      UiAutomation.class.getMethod("connect", int.class).invoke(ui, UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
      AccessibilityServiceInfo info = ui.getServiceInfo();
      info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
      ui.setServiceInfo(info);
      try { injectWithoutAnimation = UiAutomation.class.getMethod("injectInputEvent", InputEvent.class, boolean.class, boolean.class); }
      catch (NoSuchMethodException ignored) { injectWithoutAnimation = null; }
    } catch (Exception error) { close(); throw error; }
  }

  JSONObject execute(JSONObject command, Guard guard) throws Exception {
    guard.check();
    connect();
    guard.check();
    switch (command.getString("action")) {
      case "probe": return result(true, "OK");
      case "wake":
        key(KeyEvent.KEYCODE_WAKEUP, guard);
        shell(new String[]{"/system/bin/wm", "dismiss-keyguard"}, guard);
        return result(true, "WAKE_REQUESTED");
      case "observe": return observe(guard);
      case "tap": case "longpress": case "swipe": case "drag":
        touch(command, guard); return result(true, "OK");
      case "back": key(KeyEvent.KEYCODE_BACK, guard); return result(true, "OK");
      case "home": key(KeyEvent.KEYCODE_HOME, guard); return result(true, "OK");
      case "recents": key(KeyEvent.KEYCODE_APP_SWITCH, guard); return result(true, "OK");
      case "type": return type(command, guard);
      case "enter": {
        AccessibilityNodeInfo node = ui.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (node == null) return result(false, "NO_EDITABLE_FOCUS");
        try {
          if (!node.isEditable()) return result(false, "NO_EDITABLE_FOCUS");
          guard.check();
          boolean ok = node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
          return result(ok, ok ? "OK" : "ACTION_FAILED");
        } finally { node.recycle(); }
      }
      case "open": {
        String name = command.getString("packageName");
        if (name.length() > 200 || !name.matches("[a-zA-Z][\\w]*(\\.[\\w]+)+")) return result(false, "INVALID_INPUT");
        String output = shell(new String[]{"/system/bin/am", "start", "--user", "current", "-a",
          "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-p", name}, guard);
        if (output.contains("Error:") || output.contains("Exception")) return result(false, "APP_NOT_FOUND");
        return result(true, "LAUNCH_REQUESTED");
      }
      default: return result(false, "UNSUPPORTED_ACTION");
    }
  }

  private JSONObject type(JSONObject command, Guard guard) throws Exception {
    String text = command.getString("text");
    if (text.isEmpty() || text.length() > 2000) return result(false, "INVALID_INPUT");
    AccessibilityNodeInfo node = ui.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
    if (node == null) return result(false, "NO_EDITABLE_FOCUS");
    try {
      if (!node.isEditable() || (node.isPassword() && !Boolean.TRUE.equals(command.opt("password"))))
        return result(false, "NO_EDITABLE_FOCUS");
      Bundle args = new Bundle();
      args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
      guard.check();
      boolean ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
      return result(ok, ok ? "OK" : "ACTION_FAILED");
    } finally { node.recycle(); }
  }

  private void key(int code, Guard guard) {
    guard.check();
    long down = SystemClock.uptimeMillis();
    boolean pressed = false;
    try {
      pressed = inject(new KeyEvent(down, down, KeyEvent.ACTION_DOWN, code, 0));
      if (!pressed) throw new IllegalStateException("INPUT_REJECTED");
    } finally {
      // 无论用户是否在按下后暂停，都必须送出抬起，避免把按键留在按住状态。
      if (pressed && !inject(new KeyEvent(down, SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, code, 0)))
        throw new IllegalStateException("INPUT_REJECTED");
    }
  }

  private Point size() throws Exception {
    Class<?> manager = Class.forName("android.hardware.display.DisplayManagerGlobal");
    Object instance = manager.getMethod("getInstance").invoke(null);
    Display display = (Display) manager.getMethod("getRealDisplay", int.class).invoke(instance, Display.DEFAULT_DISPLAY);
    if (display == null) throw new IllegalStateException("NO_DISPLAY");
    Point size = new Point();
    display.getRealSize(size);
    return size;
  }

  private static int integer(JSONObject command, String key, int fallback, int min, int max) throws Exception {
    if (!command.has(key)) return fallback;
    Object value = command.get(key);
    if (!(value instanceof Number)) throw new IllegalArgumentException("INVALID_INPUT");
    double number = ((Number) value).doubleValue();
    if (!Double.isFinite(number) || number != Math.rint(number) || number < min || number > max)
      throw new IllegalArgumentException("INVALID_INPUT");
    return (int) number;
  }

  private void touch(JSONObject command, Guard guard) throws Exception {
    Point size = size();
    String action = command.getString("action");
    float x = TouchTrack.coordinate(command.getDouble("x"), size.x);
    float y = TouchTrack.coordinate(command.getDouble("y"), size.y);
    boolean moves = action.equals("swipe") || action.equals("drag");
    JSONArray waypoints = moves ? command.optJSONArray("points") : null;
    int count = waypoints == null ? 0 : waypoints.length();
    if (count > 16) throw new IllegalArgumentException("INVALID_INPUT");
    float[] points = new float[(count + 2) * 2];
    points[0] = x; points[1] = y;
    for (int i = 0; i < count; i++) {
      JSONArray point = waypoints.getJSONArray(i);
      if (point.length() != 2) throw new IllegalArgumentException("INVALID_INPUT");
      points[i * 2 + 2] = TouchTrack.coordinate(point.getDouble(0), size.x);
      points[i * 2 + 3] = TouchTrack.coordinate(point.getDouble(1), size.y);
    }
    points[points.length - 2] = moves ? TouchTrack.coordinate(command.getDouble("endX"), size.x) : x;
    points[points.length - 1] = moves ? TouchTrack.coordinate(command.getDouble("endY"), size.y) : y;
    int duration = action.equals("tap") ? integer(command, "duration", 80, 40, 400)
      : action.equals("longpress") ? integer(command, "duration", 700, 400, 2000)
      : action.equals("swipe") ? integer(command, "duration", 500, 100, 2000)
      : integer(command, "duration", 600, 100, 3000);
    int hold = action.equals("drag") ? integer(command, "hold", 0, 0, 2000) : 0;
    int rest = action.equals("drag") ? integer(command, "rest", 150, 0, 1000) : 0;
    TouchTrack track = new TouchTrack(points, hold, duration, rest);
    guard.check();
    long down = SystemClock.uptimeMillis();
    boolean pressed = false;
    try {
      pressed = true;
      motion(down, MotionEvent.ACTION_DOWN, x, y);
      while (SystemClock.uptimeMillis() - down < track.total()) {
        guard.check();
        float[] point = track.at(SystemClock.uptimeMillis() - down);
        x = point[0]; y = point[1];
        motion(down, MotionEvent.ACTION_MOVE, x, y);
        Thread.sleep(16);
      }
      guard.check();
      float[] last = track.at(track.total());
      motion(down, MotionEvent.ACTION_UP, last[0], last[1]);
      pressed = false;
    } finally {
      if (pressed) motion(down, MotionEvent.ACTION_CANCEL, x, y);
    }
  }

  /** 新系统可跳过动画等待，避免持续动画把长按和拖动的采样节奏拖慢。 */
  private boolean inject(InputEvent event) {
    if (injectWithoutAnimation == null) return ui.injectInputEvent(event, true);
    try { return Boolean.TRUE.equals(injectWithoutAnimation.invoke(ui, event, true, false)); }
    catch (Exception error) { throw new IllegalStateException("INPUT_REJECTED", error); }
  }

  private void motion(long down, int action, float x, float y) {
    MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
    event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
    try {
      if (!inject(event)) throw new IllegalStateException("INPUT_REJECTED");
    } finally { event.recycle(); }
  }

  private JSONObject observe(Guard guard) throws Exception {
    JSONObject data = new JSONObject();
    JSONArray nodes = new JSONArray();
    AccessibilityNodeInfo root = ui.getRootInActiveWindow();
    if (root != null) {
      try {
        if ("dev.nobot.phone".equals(String.valueOf(root.getPackageName()))) return result(false, "CONTROL_APP_VISIBLE");
        data.put("packageName", String.valueOf(root.getPackageName()));
        collect(root, nodes, 0, new int[]{0});
      } finally { root.recycle(); }
    }
    data.put("nodes", nodes);
    guard.check();
    Bitmap bitmap = ui.takeScreenshot();
    if (bitmap == null) return result(false, "SCREENSHOT_UNAVAILABLE");
    try {
      data.put("width", bitmap.getWidth()).put("height", bitmap.getHeight());
      double scale = Math.min(1.0, 1280.0 / Math.max(bitmap.getWidth(), bitmap.getHeight()));
      Bitmap small = Bitmap.createScaledBitmap(bitmap, Math.max(1, (int) (bitmap.getWidth() * scale)),
        Math.max(1, (int) (bitmap.getHeight() * scale)), true);
      try {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        small.compress(Bitmap.CompressFormat.JPEG, 75, bytes);
        if (bytes.size() > 2000000) return result(false, "SCREENSHOT_FAILED");
        guard.check();
        return result(true, "OK").put("data", data).put("image", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
      } finally { if (small != bitmap) small.recycle(); }
    } finally { bitmap.recycle(); }
  }

  private void collect(AccessibilityNodeInfo node, JSONArray nodes, int depth, int[] visited) throws Exception {
    if (++visited[0] > 400 || depth > 20 || nodes.length() >= 100) return;
    boolean password = node.isPassword();
    if (node.isVisibleToUser()) {
      Rect bounds = new Rect();
      node.getBoundsInScreen(bounds);
      JSONObject item = new JSONObject().put("text", password ? "" : limited(node.getText()))
        .put("description", password ? "" : limited(node.getContentDescription()))
        .put("viewId", limited(node.getViewIdResourceName())).put("clickable", node.isClickable()).put("editable", node.isEditable())
        .put("bounds", new JSONArray(new int[]{bounds.left, bounds.top, bounds.right, bounds.bottom}));
      if (password) item.put("password", true);
      nodes.put(item);
    }
    if (password) return;
    for (int i = 0; i < node.getChildCount() && visited[0] < 400 && nodes.length() < 100; i++) {
      AccessibilityNodeInfo child = node.getChild(i);
      if (child == null) continue;
      try { collect(child, nodes, depth + 1, visited); } finally { child.recycle(); }
    }
  }

  private static String limited(CharSequence value) { return value == null ? "" : value.subSequence(0, Math.min(200, value.length())).toString(); }

  private String shell(String[] args, Guard guard) throws Exception {
    guard.check();
    Process process = new ProcessBuilder(args).redirectErrorStream(true).start();
    try (InputStream input = process.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      long until = SystemClock.elapsedRealtime() + 3000;
      byte[] buffer = new byte[4096];
      while (true) {
        guard.check();
        while (input.available() > 0) {
          int count = input.read(buffer, 0, Math.min(buffer.length, input.available()));
          if (count <= 0) break;
          output.write(buffer, 0, count);
          if (output.size() > 32768) throw new IllegalStateException("OUTPUT_TOO_LARGE");
        }
        if (!process.isAlive()) break;
        if (SystemClock.elapsedRealtime() >= until) throw new IllegalStateException("COMMAND_TIMEOUT");
        Thread.sleep(20);
      }
      if (process.exitValue() != 0) throw new IllegalStateException("COMMAND_FAILED");
      return output.toString(StandardCharsets.UTF_8.name());
    } finally { process.destroy(); }
  }

  void close() {
    if (ui != null) {
      try { UiAutomation.class.getMethod("disconnect").invoke(ui); } catch (Exception ignored) {}
      ui = null;
    }
    if (callbacks != null) { callbacks.quitSafely(); callbacks = null; }
  }
}
