package dev.nobot.phone;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.os.Build;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 检查更新：查 GitHub Releases 的最新版本，下载 APK，核对发版时生成的 SHA256SUMS.txt，再交给系统安装器覆盖安装。
 * 不做「热更新」（运行时加载新代码）：无障碍服务的代码换不了，而且从网上加载代码等于给它开后门；
 * 走系统安装器时签名由系统核对，只有同一密钥签的新版才能装上。
 * 状态放在静态字段里，主页每秒刷新时读取；网络请求都在后台线程。
 */
final class Updater {
  static final String REPO = "IamJasperJ/NoBot-extension-PhoneControl";
  private static final String LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
  /** 打开主页时自动检查的最短间隔 */
  static final long AUTO_INTERVAL = 6 * 3600_000L;

  enum Phase { IDLE, CHECKING, LATEST, AVAILABLE, DOWNLOADING, INSTALLING, FAILED }

  static final class Release {
    final String version, page, apkName, apkUrl, sumsUrl;
    final long size;
    Release(String version, String page, String apkName, String apkUrl, String sumsUrl, long size) {
      this.version = version; this.page = page; this.apkName = apkName; this.apkUrl = apkUrl; this.sumsUrl = sumsUrl; this.size = size;
    }
  }

  static volatile Phase phase = Phase.IDLE;
  static volatile Release release;
  /** 下载进度 0–100 */
  static volatile int progress;
  /** 失败原因（strings.xml）和系统给的细节 */
  static volatile int error;
  static volatile String detail = "";
  /** 系统安装器要用户确认时给的界面，由主页在前台时打开（后台广播里不一定能启动界面） */
  static volatile Intent confirm;

  private Updater() {}

  static boolean busy() { return phase == Phase.CHECKING || phase == Phase.DOWNLOADING || phase == Phase.INSTALLING; }

  /** 后台查最新版本，结束后在后台线程调用 done */
  static synchronized void check(Context context, Runnable done) {
    if (busy()) return;
    phase = Phase.CHECKING;
    Context app = context.getApplicationContext();
    new Thread(() -> {
      try {
        JSONObject json = new JSONObject(new String(fetch(LATEST, true), StandardCharsets.UTF_8));
        String tag = json.getString("tag_name");
        JSONArray assets = json.getJSONArray("assets");
        String apkName = null, apkUrl = null, sumsUrl = null;
        long size = 0;
        for (int i = 0; i < assets.length(); i++) {
          JSONObject asset = assets.getJSONObject(i);
          String name = asset.getString("name");
          if (Releases.isApk(name)) { apkName = name; apkUrl = asset.getString("browser_download_url"); size = asset.optLong("size"); }
          else if ("SHA256SUMS.txt".equals(name)) sumsUrl = asset.getString("browser_download_url");
        }
        app.getSharedPreferences("bridge", Context.MODE_PRIVATE).edit().putLong("updateChecked", System.currentTimeMillis()).apply();
        if (Releases.compare(tag, BuildConfig.VERSION_NAME) <= 0) { release = null; phase = Phase.LATEST; }
        else if (apkUrl == null || sumsUrl == null) fail(null, R.string.update_failed_assets, tag);
        else {
          release = new Release(tag.replaceFirst("^[vV]", ""), json.optString("html_url"), apkName, apkUrl, sumsUrl, size);
          phase = Phase.AVAILABLE;
        }
      } catch (Exception e) {
        fail(null, R.string.update_failed_network, e.getClass().getSimpleName());
      }
      done.run();
    }).start();
  }

  /** 下载、校验并提交安装；调用前界面已确认可以安装未知应用 */
  static synchronized void install(Context context) {
    Release target = release;
    if (target == null || busy()) return;
    phase = Phase.DOWNLOADING;
    progress = 0;
    Context app = context.getApplicationContext();
    new Thread(() -> {
      File apk = new File(app.getCacheDir(), "update.apk");
      try {
        String expected = Releases.checksum(new String(fetch(target.sumsUrl, false), StandardCharsets.UTF_8), target.apkName);
        if (expected == null) { fail(target, R.string.update_failed_checksum, ""); return; }
        if (!expected.equals(download(target, apk))) { apk.delete(); fail(target, R.string.update_failed_checksum, ""); return; }
        // 包名和版本号也核对一遍；签名由系统安装器核对，不一致会装不上
        PackageInfo info = app.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
        if (info == null || !app.getPackageName().equals(info.packageName) || info.getLongVersionCode() <= BuildConfig.VERSION_CODE) {
          apk.delete();
          fail(target, R.string.update_failed_package, "");
          return;
        }
        phase = Phase.INSTALLING;
        commit(app, apk);
      } catch (Exception e) {
        apk.delete();
        fail(target, R.string.update_failed_network, e.getClass().getSimpleName());
      }
    }).start();
  }

  /**
   * 用 PackageInstaller 会话安装。Android 12+ 申请免确认：App 自己装过一次之后（成为「安装来源」），
   * 后续更新系统可以不再弹确认框；第一次或系统不允许时会通过 UpdateReceiver 要求确认。
   */
  private static void commit(Context app, File apk) throws IOException {
    PackageInstaller installer = app.getPackageManager().getPackageInstaller();
    PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
    params.setAppPackageName(app.getPackageName());
    params.setSize(apk.length());
    if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
    int id = installer.createSession(params);
    try (PackageInstaller.Session session = installer.openSession(id)) {
      try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("base.apk", 0, apk.length())) {
        byte[] buffer = new byte[64 * 1024];
        for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
        session.fsync(out);
      }
      // 系统要往这个 Intent 里填安装结果，所以必须可变；Android 11 默认就是可变的
      int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
      Intent result = new Intent(app, UpdateReceiver.class).setPackage(app.getPackageName());
      session.commit(PendingIntent.getBroadcast(app, id, result, flags).getIntentSender());
    } catch (IOException | RuntimeException e) {
      installer.abandonSession(id);
      throw e;
    } finally {
      apk.delete();
    }
  }

  static void fail(Release target, int message, String extra) {
    release = target;
    error = message;
    detail = extra == null ? "" : extra;
    phase = Phase.FAILED;
  }

  /** 下载 APK 到 file，返回小写十六进制 SHA-256 */
  private static String download(Release target, File file) throws Exception {
    HttpURLConnection connection = open(target.apkUrl, false);
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    long total = target.size > 0 ? target.size : connection.getContentLengthLong(), done = 0;
    try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(file)) {
      byte[] buffer = new byte[64 * 1024];
      for (int n; (n = in.read(buffer)) > 0; ) {
        out.write(buffer, 0, n);
        digest.update(buffer, 0, n);
        done += n;
        if (total > 0) progress = (int) Math.min(100, done * 100 / total);
      }
    } finally {
      connection.disconnect();
    }
    StringBuilder hex = new StringBuilder();
    for (byte b : digest.digest()) hex.append(String.format("%02x", b));
    return hex.toString();
  }

  private static byte[] fetch(String url, boolean api) throws IOException {
    HttpURLConnection connection = open(url, api);
    try (InputStream in = connection.getInputStream()) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buffer = new byte[16 * 1024];
      for (int n; (n = in.read(buffer)) > 0 && out.size() < 1024 * 1024; ) out.write(buffer, 0, n);
      return out.toByteArray();
    } finally {
      connection.disconnect();
    }
  }

  /** 只走 HTTPS；GitHub 的下载地址会重定向到它的文件服务器，HttpURLConnection 会跟随同协议的重定向 */
  private static HttpURLConnection open(String url, boolean api) throws IOException {
    if (!url.startsWith("https://")) throw new IOException("not https");
    HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(30000);
    connection.setRequestProperty("User-Agent", "NoBot-Phone/" + BuildConfig.VERSION_NAME);
    if (api) connection.setRequestProperty("Accept", "application/vnd.github+json");
    int code = connection.getResponseCode();
    if (code != 200) { connection.disconnect(); throw new IOException("HTTP " + code); }
    return connection;
  }
}
