package dev.nobot.phone;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Rect;
import android.hardware.HardwareBuffer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Display;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.json.JSONArray;
import org.json.JSONObject;

public class PhoneService extends AccessibilityService {
  public static volatile PhoneService instance;
  private volatile boolean running;
  private SharedPreferences prefs;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  /** 控制开启期间保持 CPU 运行，熄屏后轮询不会被系统休眠卡住。 */
  private PowerManager.WakeLock cpu;
  /** 我们点亮屏幕后让它保持亮着，直到空闲锁回去。 */
  private PowerManager.WakeLock screen;
  /** 屏幕是我们点亮的；只有这种情况空闲后才自动锁屏。 */
  private volatile boolean wokeScreen;
  /** 只关屏幕面板：面板当前关着 / 手机主人要求一直保持黑屏 */
  private volatile boolean panelOff, panelHold;
  private Privileged privileged;
  /** 特权调用会阻塞（Root 首次授权要等用户点），放到单独线程 */
  private final ExecutorService panelWorker = Executors.newSingleThreadExecutor();
  private long lastAction;
  private static final long RELOCK_DELAY = 30000;
  private final Runnable relock = () -> {
    if (!wokeScreen) return;
    wokeScreen = false;
    if (screen.isHeld()) screen.release();
    // 系统锁屏会关掉显示，再亮屏时会重新打开面板，所以面板状态随之复位
    panelOff = false;
    if (getSystemService(PowerManager.class).isInteractive()) performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
  };

  @Override protected void onServiceConnected() {
    instance = this;
    prefs = getSharedPreferences("bridge", MODE_PRIVATE);
    // 服务重启必须由手机主人重新开始，不能恢复执行进程退出前的控制意图。
    prefs.edit().putBoolean("enabled", false).putInt("status", R.string.paused).apply();
    privileged = new Privileged(this);
    PowerManager power = getSystemService(PowerManager.class);
    cpu = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nobot:poll");
    cpu.setReferenceCounted(false);
    screen = power.newWakeLock(PowerManager.SCREEN_DIM_WAKE_LOCK, "nobot:screen");
    screen.setReferenceCounted(false);
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(new NotificationChannel("control", getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW));
    running = true;
    worker.execute(this::loop);
  }

  private boolean enabled() { return running && prefs.getBoolean("enabled", false); }
  private void status(int id) { prefs.edit().putInt("status", id).apply(); }
  private void notification(boolean active) {
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (!active) { manager.cancel(1); return; }
    PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    manager.notify(1, new Notification.Builder(this, "control").setSmallIcon(android.R.drawable.ic_menu_view)
      .setContentTitle(getString(R.string.app_name)).setContentText(getString(R.string.active))
      .setContentIntent(open).setOngoing(true).build());
  }

  private void loop() {
    JSONObject pending = null;
    String pendingToken = "";
    long pendingEpoch = -1;
    int failures = 0;
    while (running) {
      try {
        notification(enabled());
        awake(enabled());
        maintainPanel();
        if (!enabled()) { pending = null; Thread.sleep(500); continue; }
        long epoch = prefs.getLong("epoch", 0);
        String base = prefs.getString("url", "");
        String token = prefs.getString("token", "");
        String device = prefs.getString("device", "");
        if (!pendingToken.equals(token) || pendingEpoch != epoch) pending = null;
        if (pending != null) {
          request(base + "/result", token, device, pending);
          pending = null;
        }
        long pollStarted = SystemClock.elapsedRealtime();
        JSONObject response = request(base + "/poll", token, device, new JSONObject().put("protocol", 1).put("ready", true));
        if (enabled()) status(R.string.connected);
        failures = 0;
        JSONObject job = response.optJSONObject("job");
        if (job != null && enabled() && epoch == prefs.getLong("epoch", 0) && token.equals(prefs.getString("token", ""))) {
          String id = job.getString("id");
          long deadline = pollStarted + Math.min(25000, job.getLong("ttlMs"));
          JSONObject result;
          if (id.equals(prefs.getString("lastCommand", ""))) result = result(false, "DUPLICATE_OUTCOME_UNKNOWN");
          else if (SystemClock.elapsedRealtime() + 3000 >= deadline) result = result(false, "EXPIRED");
          else {
            // 先同步落盘再执行，进程在动作完成后崩溃也不能重复执行同一指令。
            if (!prefs.edit().putString("lastCommand", id).commit()) throw new IllegalStateException("STORAGE_FAILED");
            CompletableFuture<JSONObject> future = new CompletableFuture<>();
            main.post(() -> {
              if (!enabled() || epoch != prefs.getLong("epoch", 0) || !token.equals(prefs.getString("token", "")) || SystemClock.elapsedRealtime() + 3000 >= deadline) {
                future.complete(result(false, "CANCELLED")); return;
              }
              execute(job.optJSONObject("command"), future);
            });
            try { result = future.get(Math.max(1, Math.min(10000, deadline - SystemClock.elapsedRealtime())), TimeUnit.MILLISECONDS); }
            catch (TimeoutException e) {
              prefs.edit().putBoolean("enabled", false).apply();
              status(R.string.execution_timeout);
              // 已派发手势可能仍会完成，暂停后不继续消费下一条指令。
              result = result(false, "OUTCOME_UNKNOWN");
            }
          }
          pending = new JSONObject().put("id", id).put("result", result);
          pendingToken = token;
          pendingEpoch = epoch;
          request(base + "/result", token, device, pending);
          pending = null;
        }
        Thread.sleep(Screen.pollInterval(getSystemService(PowerManager.class).isInteractive()));
      } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
      catch (Unauthorized e) {
        prefs.edit().putBoolean("enabled", false).apply();
        status(R.string.unauthorized);
      } catch (PublicHttp e) {
        // 配置本身不安全，重试没有意义，暂停等手机主人改成 HTTPS 或内网地址。
        prefs.edit().putBoolean("enabled", false).apply();
        status(R.string.public_http);
      } catch (Exception e) {
        if (enabled()) status(R.string.network_error);
        try { Thread.sleep(Math.min(15000, 1000L << Math.min(4, failures++))); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
      }
    }
    notification(false);
    awake(false);
  }

  private boolean panelMode() { return "panel".equals(prefs.getString("mode", "wake")); }

  /** 关 / 开面板；结果写进 panelStatus 给主页显示，失败时指令照常执行（只是屏幕亮着）。只在后台线程调用。 */
  private boolean setPanel(boolean on) {
    int message;
    try {
      privileged.set(on);
      panelOff = !on;
      prefs.edit().putInt("panelStatus", on ? R.string.panel_restored : R.string.panel_off).apply();
      return true;
    } catch (Privileged.Unavailable e) {
      message = e.message;
    } catch (Exception e) {
      message = R.string.panel_failed;
    }
    prefs.edit().putInt("panelStatus", message).apply();
    return false;
  }

  /** 轮询线程每轮检查：手机主人按了电源键（系统已接管显示）或暂停控制时结束黑屏。 */
  private void maintainPanel() {
    if (!panelOff && !panelHold) return;
    boolean interactive = getSystemService(PowerManager.class).isInteractive();
    if (!interactive) {
      panelOff = false;
      endHold();
    } else if (!enabled() || !panelMode()) {
      endHold();
      if (panelOff) setPanel(true);
    } else if (panelHold) screen.acquire(60000);
  }

  private void endHold() {
    if (!panelHold) return;
    panelHold = false;
    if (!wokeScreen && screen.isHeld()) screen.release();
  }

  /**
   * 主页「现在关闭屏幕面板」：先回桌面（App 自己在前台时不能截图），再关面板并一直保持，
   * 期间系统保持亮屏、解锁。按电源键即恢复正常。
   */
  void holdPanel() {
    if (!enabled()) { toast(R.string.panel_need_start); return; }
    wokeScreen = false;
    main.removeCallbacks(relock);
    performGlobalAction(GLOBAL_ACTION_HOME);
    main.postDelayed(() -> panelWorker.execute(() -> {
      if (!setPanel(false)) { main.post(() -> toast(prefs.getInt("panelStatus", R.string.panel_failed))); return; }
      panelHold = true;
      screen.acquire(60000);
    }), 1500);
  }

  private void toast(int message) { android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show(); }

  /** 每轮轮询都续期一分钟：轮询线程意外退出时锁会自己过期，不会一直耗电。 */
  private void awake(boolean on) {
    if (on) cpu.acquire(60000);
    else if (cpu.isHeld()) cpu.release();
  }

  private static class Unauthorized extends Exception {}
  private static class PublicHttp extends Exception {}
  private JSONObject request(String endpoint, String token, String device, JSONObject payload) throws Exception {
    URL url = new URL(endpoint);
    if ("http".equals(url.getProtocol())) {
      // HTTP 不加密，只允许解析到内网 / VPN 地址；域名每次请求前重新检查，防止解析结果变成公网。
      for (InetAddress address : InetAddress.getAllByName(url.getHost())) if (!Endpoint.isPrivate(address)) throw new PublicHttp();
    } else if (!"https".equals(url.getProtocol())) throw new IllegalArgumentException("HTTPS_REQUIRED");
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    try {
      // 不跟随重定向，防止把设备令牌发送到其他地址。
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(8000);
      connection.setReadTimeout(10000);
      connection.setRequestMethod("POST");
      connection.setRequestProperty("Authorization", "Bearer " + token);
      connection.setRequestProperty("X-Device-Id", device);
      connection.setRequestProperty("Content-Type", "application/json");
      connection.setDoOutput(true);
      byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(bytes.length);
      try (java.io.OutputStream out = connection.getOutputStream()) { out.write(bytes); }
      int code = connection.getResponseCode();
      if (code == 401 || code == 403 || code == 404) throw new Unauthorized();
      // 过期回报已无接收者，丢弃回报后继续观察，绝不重新执行。
      if (code == 409) return new JSONObject().put("accepted", false);
      if (code != 200) throw new IllegalStateException("HTTP_FAILED");
      try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
          if (output.size() + count > 100000) throw new IllegalStateException("PAYLOAD_TOO_LARGE");
          output.write(buffer, 0, count);
        }
        return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
      }
    } finally { connection.disconnect(); }
  }

  private static JSONObject result(boolean ok, String code) {
    JSONObject result = new JSONObject();
    try { result.put("ok", ok).put("code", code); } catch (Exception ignored) {}
    return result;
  }

  /** 先按屏幕状态处理（必要时亮屏解锁），再执行动作；空闲 30 秒后把自己点亮的屏幕锁回去。 */
  private void execute(JSONObject command, CompletableFuture<JSONObject> future) {
    main.removeCallbacks(relock);
    future.whenComplete((value, error) -> main.post(() -> {
      lastAction = SystemClock.elapsedRealtime();
      if (wokeScreen) main.postDelayed(relock, RELOCK_DELAY);
    }));
    PowerManager power = getSystemService(PowerManager.class);
    KeyguardManager keyguard = getSystemService(KeyguardManager.class);
    switch (Screen.decide(power.isInteractive(), keyguard.isKeyguardLocked(), keyguard.isDeviceLocked(), prefs.getBoolean("wake", true))) {
      case RUN: run(command, future); return;
      case LOCKED: future.complete(result(false, "DEVICE_LOCKED")); return;
      case SCREEN_OFF: future.complete(result(false, "SCREEN_OFF")); return;
      default:
    }
    if (!power.isInteractive()) wokeScreen = true;
    if (!screen.isHeld()) screen.acquire(RELOCK_DELAY * 4);
    try {
      startActivity(new Intent(this, UnlockActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION));
    } catch (Exception e) { future.complete(result(false, "DEVICE_LOCKED")); return; }
    long until = SystemClock.elapsedRealtime() + 3000;
    main.post(new Runnable() {
      @Override public void run() {
        if (future.isDone()) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        boolean ours = root != null && getPackageName().contentEquals(root.getPackageName());
        if (power.isInteractive() && !keyguard.isKeyguardLocked() && !ours) {
          // 解锁动画结束、原来的应用回到前台后再动手；只关面板模式先把刚点亮的面板关掉
          if (panelMode() && wokeScreen) panelWorker.execute(() -> {
            setPanel(false);
            main.post(() -> PhoneService.this.run(command, future));
          });
          else main.postDelayed(() -> PhoneService.this.run(command, future), 400);
        } else if (SystemClock.elapsedRealtime() > until) future.complete(result(false, "DEVICE_LOCKED"));
        else main.postDelayed(this, 100);
      }
    });
  }

  private void run(JSONObject command, CompletableFuture<JSONObject> future) {
    try {
      if (getSystemService(KeyguardManager.class).isKeyguardLocked()) {
        future.complete(result(false, "DEVICE_LOCKED")); return;
      }
      String action = command.getString("action");
      switch (action) {
        case "observe": observe(future); return;
        case "tap": case "swipe": gesture(command, future); return;
        case "type": {
          String text = command.getString("text");
          if (text.isEmpty() || text.length() > 2000) throw new IllegalArgumentException();
          AccessibilityNodeInfo node = findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
          if (node == null || !node.isEditable() || node.isPassword()) { future.complete(result(false, "NO_EDITABLE_FOCUS")); return; }
          Bundle args = new Bundle();
          args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
          boolean success = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
          future.complete(result(success, success ? "OK" : "ACTION_FAILED")); return;
        }
        case "open": {
          String name = command.getString("packageName");
          if (!name.matches("[a-zA-Z][\\w]*(\\.[\\w]+)+") || name.length() > 200) throw new IllegalArgumentException();
          Intent launch = getPackageManager().getLaunchIntentForPackage(name);
          if (launch == null) { future.complete(result(false, "APP_NOT_FOUND")); return; }
          launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          startActivity(launch);
          future.complete(result(true, "LAUNCH_REQUESTED")); return;
        }
        case "back": case "home": case "recents": {
          int key = action.equals("back") ? GLOBAL_ACTION_BACK : action.equals("home") ? GLOBAL_ACTION_HOME : GLOBAL_ACTION_RECENTS;
          boolean success = performGlobalAction(key);
          future.complete(result(success, success ? "OK" : "ACTION_FAILED")); return;
        }
        default: future.complete(result(false, "UNSUPPORTED_ACTION"));
      }
    } catch (Exception e) { future.complete(result(false, "ACTION_FAILED")); }
  }

  private float coordinate(JSONObject command, String key, int size) throws Exception {
    double value = command.getDouble(key);
    if (!Double.isFinite(value) || value < 0 || value > 1) throw new IllegalArgumentException();
    return (float) (value * (size - 1));
  }
  private void gesture(JSONObject command, CompletableFuture<JSONObject> future) throws Exception {
    Rect bounds = getSystemService(WindowManager.class).getMaximumWindowMetrics().getBounds();
    Path path = new Path();
    path.moveTo(coordinate(command, "x", bounds.width()), coordinate(command, "y", bounds.height()));
    int duration = 80;
    if (command.getString("action").equals("swipe")) {
      path.lineTo(coordinate(command, "endX", bounds.width()), coordinate(command, "endY", bounds.height()));
      duration = command.optInt("duration", 500);
      if (duration < 100 || duration > 2000) throw new IllegalArgumentException();
    }
    GestureDescription description = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(path, 0, duration)).build();
    boolean accepted = dispatchGesture(description, new GestureResultCallback() {
      @Override public void onCompleted(GestureDescription gesture) { future.complete(result(true, "OK")); }
      @Override public void onCancelled(GestureDescription gesture) { future.complete(result(false, "GESTURE_CANCELLED")); }
    }, main);
    if (!accepted) future.complete(result(false, "GESTURE_REJECTED"));
  }

  private void observe(CompletableFuture<JSONObject> future) throws Exception {
    JSONObject data = new JSONObject();
    JSONArray nodes = new JSONArray();
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root != null && getPackageName().contentEquals(root.getPackageName())) {
      future.complete(result(false, "CONTROL_APP_VISIBLE")); return;
    }
    if (root != null) {
      data.put("packageName", String.valueOf(root.getPackageName()));
      collect(root, nodes, 0, new int[]{0});
    }
    data.put("nodes", nodes);
    takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
      @Override public void onSuccess(ScreenshotResult screenshot) {
        try (HardwareBuffer hardware = screenshot.getHardwareBuffer()) {
          Bitmap wrapped = Bitmap.wrapHardwareBuffer(hardware, screenshot.getColorSpace());
          if (wrapped == null) throw new IllegalStateException();
          Bitmap source = wrapped.copy(Bitmap.Config.ARGB_8888, false);
          wrapped.recycle();
          data.put("width", source.getWidth()).put("height", source.getHeight());
          double scale = Math.min(1.0, 1280.0 / Math.max(source.getWidth(), source.getHeight()));
          Bitmap small = Bitmap.createScaledBitmap(source, Math.max(1, (int)(source.getWidth() * scale)), Math.max(1, (int)(source.getHeight() * scale)), true);
          ByteArrayOutputStream output = new ByteArrayOutputStream();
          small.compress(Bitmap.CompressFormat.JPEG, 75, output);
          if (small != source) small.recycle();
          source.recycle();
          if (output.size() > 2000000) throw new IllegalStateException();
          future.complete(result(true, "OK").put("data", data).put("image", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)));
        } catch (Exception e) { future.complete(result(false, "SCREENSHOT_FAILED")); }
      }
      @Override public void onFailure(int errorCode) {
        try { future.complete(result(false, "SCREENSHOT_UNAVAILABLE").put("data", data.put("androidError", errorCode))); }
        catch (Exception e) { future.complete(result(false, "SCREENSHOT_FAILED")); }
      }
    });
  }

  private void collect(AccessibilityNodeInfo node, JSONArray nodes, int depth, int[] visited) throws Exception {
    if (++visited[0] > 400 || depth > 20 || nodes.length() >= 100 || node.isPassword()) return;
    if (node.isVisibleToUser()) {
      Rect bounds = new Rect();
      node.getBoundsInScreen(bounds);
      nodes.put(new JSONObject().put("text", limited(node.getText())).put("description", limited(node.getContentDescription()))
        .put("viewId", limited(node.getViewIdResourceName())).put("clickable", node.isClickable()).put("editable", node.isEditable())
        .put("bounds", new JSONArray(new int[]{bounds.left, bounds.top, bounds.right, bounds.bottom})));
    }
    for (int i = 0; i < node.getChildCount() && visited[0] < 400 && nodes.length() < 100; i++) {
      AccessibilityNodeInfo child = node.getChild(i);
      if (child != null) collect(child, nodes, depth + 1, visited);
    }
  }
  private String limited(CharSequence value) { return value == null ? "" : value.subSequence(0, Math.min(200, value.length())).toString(); }
  /** 我们的动作结束 2 秒后还有窗口切换，多半是手机主人拿起来用了：不再自动锁屏。 */
  @Override public void onAccessibilityEvent(AccessibilityEvent event) {
    if (wokeScreen && main.hasCallbacks(relock) && SystemClock.elapsedRealtime() - lastAction > 2000) {
      wokeScreen = false;
      main.removeCallbacks(relock);
      if (screen.isHeld()) screen.release();
    }
  }
  @Override public void onInterrupt() { if (prefs != null) prefs.edit().putBoolean("enabled", false).putInt("status", R.string.paused).apply(); }
  @Override public void onDestroy() {
    running = false;
    instance = null;
    if (prefs != null) prefs.edit().putBoolean("enabled", false).putInt("status", R.string.paused).apply();
    worker.shutdownNow();
    // 特权进程断开时会自己恢复面板
    panelWorker.execute(privileged::close);
    panelWorker.shutdown();
    notification(false);
    main.removeCallbacks(relock);
    if (cpu != null && cpu.isHeld()) cpu.release();
    if (screen != null && screen.isHeld()) screen.release();
    super.onDestroy();
  }
}
