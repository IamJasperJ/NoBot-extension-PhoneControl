package dev.nobot.phone;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import rikka.shizuku.Shizuku;

/**
 * 主页：状态卡（连接状态 + 开始 / 暂停）、配对、准备工作清单、熄屏使用。
 * 项目不用 AndroidX 和布局 XML，界面全部用代码搭，配色在 res/values(-night)/colors.xml。
 */
public class MainActivity extends Activity {
  private SharedPreferences prefs;
  private EditText url, device, token;
  private TextView status, server, panelStatus, shizukuStatus, outages, updateLink, updateTitle, updateText;
  private Button toggle, updateButton;
  private View manual, panelSection, updateCard;
  /** 准备工作清单里的状态行，每秒刷新 */
  private Check accessibility, battery, notifications;
  private final Shizuku.OnRequestPermissionResultListener shizukuResult = (code, result) ->
    runOnUiThread(() -> toast(result == PackageManager.PERMISSION_GRANTED ? R.string.privilege_ok : R.string.shizuku_permission));
  private final Handler handler = new Handler();
  private final Runnable refresh = new Runnable() {
    @Override public void run() {
      render();
      handler.postDelayed(this, 1000);
    }
  };

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    // 配对凭据页禁止截屏，避免角色在观察手机时读到自己的控制密钥。
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    prefs = getSharedPreferences("bridge", MODE_PRIVATE);
    LinearLayout page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(dp(16), dp(20), dp(16), dp(32));

    TextView title = text(R.string.app_name, 22, R.color.text);
    title.setTypeface(Typeface.DEFAULT_BOLD);
    page.addView(title);
    LinearLayout top = new LinearLayout(this);
    top.setOrientation(LinearLayout.HORIZONTAL);
    top.setGravity(Gravity.CENTER_VERTICAL);
    TextView version = text(0, 13, R.color.muted);
    version.setText(getString(R.string.version, BuildConfig.VERSION_NAME));
    top.addView(version, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
    updateLink = text(R.string.update_check, 13, R.color.accent);
    updateLink.setPadding(dp(10), dp(8), dp(4), dp(8));
    updateLink.setBackground(ripple(null));
    updateLink.setOnClickListener(view -> checkUpdate(true));
    top.addView(updateLink);
    page.addView(top, margins(0, 0, 0, dp(10)));

    // 新版本：检查到 GitHub 上有更新的发行版时才显示
    LinearLayout update = card(page);
    updateCard = update;
    updateTitle = text(0, 15, R.color.text);
    updateTitle.setTypeface(Typeface.DEFAULT_BOLD);
    update.addView(updateTitle);
    updateText = text(0, 13, R.color.muted);
    update.addView(updateText, margins(0, dp(4), 0, dp(8)));
    LinearLayout updateActions = new LinearLayout(this);
    updateActions.setOrientation(LinearLayout.HORIZONTAL);
    update.addView(updateActions);
    updateButton = button(updateActions, R.string.update_install, true, this::installUpdate);
    Button notes = button(updateActions, R.string.update_notes, false, () -> {
      Updater.Release release = Updater.release;
      String address = release != null && release.page.startsWith("https://") ? release.page : "https://github.com/" + Updater.REPO + "/releases";
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address)));
    });
    updateButton.setLayoutParams(weight(0, dp(4)));
    notes.setLayoutParams(weight(dp(4), 0));
    update.setVisibility(View.GONE);

    // 状态卡
    LinearLayout hero = card(page);
    status = text(0, 15, R.color.text);
    status.setTypeface(Typeface.DEFAULT_BOLD);
    status.setGravity(Gravity.CENTER_VERTICAL);
    status.setCompoundDrawablePadding(dp(8));
    hero.addView(status);
    server = text(0, 13, R.color.muted);
    hero.addView(server, margins(0, dp(4), 0, dp(14)));
    toggle = button(hero, 0, true, this::toggle);

    // 配对
    LinearLayout pair = card(page);
    pair.addView(heading(R.string.section_pair));
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.HORIZONTAL);
    pair.addView(row);
    Button scan = button(row, R.string.scan, true, () -> startActivityForResult(new Intent(this, ScanActivity.class), 3));
    Button paste = button(row, R.string.paste, false, this::paste);
    scan.setLayoutParams(weight(0, dp(4)));
    paste.setLayoutParams(weight(dp(4), 0));
    TextView more = link(pair, R.string.manual_show);
    LinearLayout fields = new LinearLayout(this);
    fields.setOrientation(LinearLayout.VERTICAL);
    manual = fields;
    url = input(fields, R.string.url, "url", false);
    device = input(fields, R.string.device, "device", false);
    token = input(fields, R.string.token, "token", true);
    button(fields, R.string.save, false, this::save);
    fields.setVisibility(View.GONE);
    pair.addView(fields);
    more.setOnClickListener(view -> {
      boolean open = manual.getVisibility() != View.VISIBLE;
      manual.setVisibility(open ? View.VISIBLE : View.GONE);
      more.setText(open ? R.string.manual_hide : R.string.manual_show);
    });

    // 准备工作
    LinearLayout setup = card(page);
    setup.addView(heading(R.string.section_setup));
    accessibility = new Check(setup, R.string.check_accessibility, R.string.action_enable,
      () -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
    battery = new Check(setup, R.string.check_battery, R.string.action_disable, this::requestBattery);
    Check background = new Check(setup, R.string.check_background, R.string.action_open,
      () -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
    background.state.setText(R.string.check_background_hint);
    if (Build.VERSION.SDK_INT >= 33)
      notifications = new Check(setup, R.string.check_notifications, R.string.action_allow,
        () -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1));

    // 旧模式仍是默认值，切换执行器先暂停，避免在同一条指令中混用两套输入方式。
    LinearLayout execution = card(page);
    execution.addView(heading(R.string.control_mode_title));
    radios(execution, "controlMode", ControlMode.ACCESSIBILITY,
      new int[]{R.string.control_accessibility, R.string.control_shizuku},
      new String[]{ControlMode.ACCESSIBILITY, ControlMode.SHIZUKU}, value -> {
        prefs.edit().putBoolean("enabled", false).putLong("epoch", prefs.getLong("epoch", 0) + 1)
          .putInt("status", R.string.paused).apply();
        toast(R.string.control_mode_changed);
        render();
      });
    execution.addView(text(R.string.control_mode_hint, 13, R.color.muted));
    button(execution, R.string.control_check, false, this::checkControl);

    // 熄屏使用
    LinearLayout screen = card(page);
    screen.addView(heading(R.string.section_screen));
    Switch wake = new Switch(this);
    wake.setText(R.string.wake);
    wake.setTextColor(getColor(R.color.text));
    wake.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    wake.setChecked(prefs.getBoolean("wake", true));
    wake.setOnCheckedChangeListener((view, checked) -> prefs.edit().putBoolean("wake", checked).apply());
    screen.addView(wake, margins(0, 0, 0, dp(4)));
    screen.addView(text(R.string.wake_hint, 13, R.color.muted), margins(0, 0, 0, dp(14)));
    screen.addView(label(R.string.mode_title));
    radios(screen, "mode", "wake", new int[]{R.string.mode_wake, R.string.mode_panel}, new String[]{"wake", "panel"},
      value -> panelSection.setVisibility("panel".equals(value) ? View.VISIBLE : View.GONE));
    LinearLayout panel = new LinearLayout(this);
    panel.setOrientation(LinearLayout.VERTICAL);
    panelSection = panel;
    panel.addView(text(R.string.mode_hint, 13, R.color.muted), margins(0, dp(4), 0, dp(14)));
    panel.addView(label(R.string.privilege_title));
    radios(panel, "privilege", Privileged.SHIZUKU, new int[]{R.string.privilege_shizuku, R.string.privilege_root},
      new String[]{Privileged.SHIZUKU, Privileged.ROOT}, value -> {});
    LinearLayout actions = new LinearLayout(this);
    actions.setOrientation(LinearLayout.HORIZONTAL);
    panel.addView(actions, margins(0, dp(10), 0, 0));
    Button check = button(actions, R.string.privilege_check, false, this::checkPrivilege);
    Button hold = button(actions, R.string.panel_hold, false, () -> {
      if (PhoneService.instance == null) toast(R.string.need_accessibility);
      else PhoneService.instance.holdPanel();
    });
    check.setLayoutParams(weight(0, dp(4)));
    hold.setLayoutParams(weight(dp(4), 0));
    panelStatus = text(0, 13, R.color.muted);
    panel.addView(panelStatus, margins(0, dp(12), 0, 0));
    shizukuStatus = text(0, 13, R.color.muted);
    panel.addView(shizukuStatus, margins(0, dp(2), 0, 0));
    panel.setVisibility("panel".equals(prefs.getString("mode", "wake")) ? View.VISIBLE : View.GONE);
    screen.addView(panel);

    // 最近断线：恢复后由 PhoneService 记下的时间、时长和原因，帮主人判断是被系统冻结还是网络问题
    LinearLayout history = card(page);
    history.addView(heading(R.string.section_outages));
    outages = text(0, 14, R.color.text);
    history.addView(outages);
    history.addView(text(R.string.outages_hint, 13, R.color.muted), margins(0, dp(10), 0, 0));

    page.addView(text(R.string.disclosure, 12, R.color.muted), margins(dp(4), dp(4), dp(4), 0));
    Shizuku.addRequestPermissionResultListener(shizukuResult);
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.addView(page);
    setContentView(scroll);
    // 旋转重建时 Intent 还是原来那个，只在首次创建时处理链接。
    if (state == null) handle(getIntent());
  }

  /** 每秒刷新：连接状态、开始 / 暂停按钮、准备工作清单、面板与 Shizuku 状态 */
  private void render() {
    int current = prefs.getInt("status", R.string.paused);
    status.setText(current);
    status.setTextColor(getColor(tone(current)));
    GradientDrawable dot = new GradientDrawable();
    dot.setShape(GradientDrawable.OVAL);
    dot.setColor(getColor(tone(current)));
    dot.setSize(dp(10), dp(10));
    status.setCompoundDrawablesRelativeWithIntrinsicBounds(dot, null, null, null);
    String saved = prefs.getString("url", "");
    server.setText(saved.isEmpty() ? getString(R.string.server_none) : getString(R.string.server, Endpoint.origin(saved)));
    toggle.setText(prefs.getBoolean("enabled", false) ? R.string.pause : R.string.start);
    accessibility.set(PhoneService.instance != null, R.string.state_on, R.string.state_off);
    battery.set(getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName()), R.string.state_exempt, R.string.state_limited);
    if (Build.VERSION.SDK_INT >= 33 && notifications != null)
      notifications.set(checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED, R.string.state_allowed, R.string.state_denied);
    panelStatus.setText(prefs.getInt("panelStatus", R.string.panel_idle));
    shizukuStatus.setText(shizukuState());
    outages.setText(outageText(prefs.getString("outages", "[]")));
    renderUpdate();
  }

  /** 检查更新的状态：链接文字、新版本卡片；安装器要确认时在前台打开确认界面 */
  private void renderUpdate() {
    Updater.Phase phase = Updater.phase;
    Updater.Release release = Updater.release;
    updateLink.setText(phase == Updater.Phase.CHECKING ? R.string.update_checking : R.string.update_check);
    boolean show = release != null && (phase == Updater.Phase.AVAILABLE || phase == Updater.Phase.DOWNLOADING
      || phase == Updater.Phase.INSTALLING || phase == Updater.Phase.FAILED);
    updateCard.setVisibility(show ? View.VISIBLE : View.GONE);
    if (!show) return;
    updateTitle.setText(getString(R.string.update_available, release.version));
    updateButton.setEnabled(phase == Updater.Phase.AVAILABLE || phase == Updater.Phase.FAILED);
    updateButton.setText(phase == Updater.Phase.FAILED ? R.string.update_retry : R.string.update_install);
    switch (phase) {
      case DOWNLOADING -> updateText.setText(getString(R.string.update_downloading, Updater.progress));
      case INSTALLING -> updateText.setText(R.string.update_installing);
      case FAILED -> updateText.setText(failureText());
      default -> updateText.setText(getString(R.string.update_hint, BuildConfig.VERSION_NAME));
    }
    updateText.setTextColor(getColor(phase == Updater.Phase.FAILED ? R.color.bad : R.color.muted));
    Intent confirm = Updater.confirm;
    if (confirm != null) {
      Updater.confirm = null;
      try { startActivity(confirm); }
      catch (Exception e) { Updater.fail(release, R.string.update_failed_install, e.getClass().getSimpleName()); }
    }
  }

  private String failureText() {
    String detail = Updater.detail;
    return getString(Updater.error, detail.isEmpty() ? getString(R.string.cause_unknown) : detail);
  }

  /** 手动检查时提示结果；自动检查只在有新版本时显示卡片 */
  private void checkUpdate(boolean manual) {
    if (Updater.busy()) return;
    Updater.check(this, () -> runOnUiThread(() -> {
      if (isDestroyed()) return;
      render();
      if (!manual) return;
      if (Updater.phase == Updater.Phase.LATEST) toast(R.string.update_latest);
      else if (Updater.phase == Updater.Phase.FAILED && Updater.release == null)
        Toast.makeText(this, failureText(), Toast.LENGTH_LONG).show();
    }));
    render();
  }

  /** 第一次更新要先在系统设置里允许本 App 安装应用 */
  private void installUpdate() {
    if (Updater.phase == Updater.Phase.FAILED && Updater.release == null) { checkUpdate(true); return; }
    if (!getPackageManager().canRequestPackageInstalls()) {
      toast(R.string.update_allow_install);
      startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
      return;
    }
    if (Updater.phase == Updater.Phase.FAILED) Updater.phase = Updater.Phase.AVAILABLE;
    Updater.install(this);
    render();
  }

  /** 最近断线，最新的在上面：「11-05 01:25 · 6 分钟 · 被系统冻结」 */
  private String outageText(String json) {
    StringBuilder out = new StringBuilder();
    try {
      org.json.JSONArray list = new org.json.JSONArray(json);
      java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("MM-dd HH:mm", java.util.Locale.getDefault());
      for (int i = list.length() - 1; i >= 0; i--) {
        org.json.JSONObject item = list.getJSONObject(i);
        long minutes = Math.max(1, Math.round(item.getLong("offlineMs") / 60000.0));
        if (out.length() > 0) out.append('\n');
        out.append(getString(R.string.outage_line, format.format(new java.util.Date(item.getLong("at"))), minutes, getString(causeText(item.optString("cause")))));
      }
    } catch (Exception ignored) {}
    return out.length() == 0 ? getString(R.string.outages_none) : out.toString();
  }

  private static int causeText(String cause) {
    switch (cause) {
      case "frozen": return R.string.cause_frozen;
      case "network": return R.string.cause_network;
      case "restarted": return R.string.cause_restarted;
      case "paused": return R.string.cause_paused;
      default: return R.string.cause_unknown;
    }
  }

  /** 状态文字的颜色：已连接绿、连接中黄、出错红、暂停灰 */
  private static int tone(int status) {
    if (status == R.string.connected) return R.color.good;
    if (status == R.string.connecting) return R.color.warn;
    if (status == R.string.paused) return R.color.muted;
    return R.color.bad;
  }

  private void toggle() {
    if (checkingControl) { toast(R.string.control_checking); return; }
    if (prefs.getBoolean("enabled", false)) {
      prefs.edit().putLong("epoch", prefs.getLong("epoch", 0) + 1).putBoolean("enabled", false).putInt("status", R.string.paused).apply();
      render();
      return;
    }
    if (PhoneService.instance == null) { toast(R.string.need_accessibility); return; }
    if (ControlMode.privileged(prefs.getString("controlMode", ControlMode.ACCESSIBILITY))) {
      if (!Shizuku.pingBinder()) { toast(R.string.shizuku_not_running); return; }
      if (Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) { Shizuku.requestPermission(4); return; }
    }
    if (!valid() || !prefs.getString("token", "").equals(token.getText().toString().trim())
        || !prefs.getString("device", "").equals(device.getText().toString().trim())
        || !prefs.getString("url", "").equals(Endpoint.normalize(url.getText().toString()))) {
      toast(R.string.invalid); return;
    }
    if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
    prefs.edit().putLong("epoch", prefs.getLong("epoch", 0) + 1).putBoolean("enabled", true).putInt("status", R.string.connecting).apply();
    render();
  }

  @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); handle(intent); }
  @Override protected void onActivityResult(int code, int result, Intent data) {
    super.onActivityResult(code, result, data);
    if (code == 3 && result == RESULT_OK && data != null) offer(data.getStringExtra(ScanActivity.EXTRA_LINK));
  }

  /** 系统相机或扫一扫打开 nobot-phone://pair 链接。 */
  private void handle(Intent intent) {
    if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) offer(intent.getData().toString());
  }

  /** Shizuku 连接状态，主页每秒刷新 */
  private static int shizukuState() {
    if (!Shizuku.pingBinder()) return R.string.shizuku_state_none;
    try {
      return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED ? R.string.shizuku_state_ready : R.string.shizuku_state_unauthorized;
    } catch (Exception e) { return R.string.shizuku_state_none; }
  }

  /** 先申请 Shizuku 权限，再实际连接自动化服务；仅检测，不注入输入或点亮屏幕。 */
  private boolean checkingControl;

  private void checkControl() {
    if (checkingControl) { toast(R.string.control_checking); return; }
    if (prefs.getBoolean("enabled", false)) { toast(R.string.control_pause_check); return; }
    if (!Shizuku.pingBinder()) { toast(R.string.shizuku_not_running); return; }
    if (Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) { Shizuku.requestPermission(4); return; }
    PhoneService service = PhoneService.instance;
    if (service == null) { toast(R.string.need_accessibility); return; }
    checkingControl = true;
    service.checkControl(result -> runOnUiThread(() -> {
      checkingControl = false;
      if (!isDestroyed()) toast(result.optBoolean("ok") ? R.string.control_ready : R.string.control_failed);
    }));
  }

  /** 检测所选权限来源；Shizuku 未授权时弹出 Shizuku 的授权框，Root 用 su -c id 试一次（Magisk 等会弹授权框）。 */
  private void checkPrivilege() {
    if (ControlMode.privileged(prefs.getString("controlMode", ControlMode.ACCESSIBILITY))
        || Privileged.SHIZUKU.equals(prefs.getString("privilege", Privileged.SHIZUKU))) {
      new Thread(() -> {
        int message = R.string.privilege_ok;
        try { Privileged.check(Privileged.SHIZUKU); }
        catch (Privileged.Unavailable e) { message = e.message; }
        int result = message;
        runOnUiThread(() -> {
          if (result == R.string.shizuku_permission) Shizuku.requestPermission(4);
          else toast(result);
        });
      }).start();
      return;
    }
    new Thread(() -> {
      boolean ok;
      try {
        Process process = new ProcessBuilder("su", "-c", "id").start();
        ok = process.waitFor(20, java.util.concurrent.TimeUnit.SECONDS);
        String line = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), java.nio.charset.StandardCharsets.UTF_8)).readLine();
        ok = ok && line != null && line.contains("uid=0");
        process.destroy();
      } catch (Exception e) { ok = false; }
      boolean granted = ok;
      runOnUiThread(() -> toast(granted ? R.string.privilege_ok : R.string.root_denied));
    }).start();
  }

  @Override protected void onDestroy() { Shizuku.removeRequestPermissionResultListener(shizukuResult); super.onDestroy(); }

  /** 熄屏后系统省电会断网、冻结轮询；侧载 App 自用，可以直接弹出系统的豁免确认框。 */
  @android.annotation.SuppressLint("BatteryLife") // 侧载自用，不上架 Play，没有它熄屏后无法保持连接
  private void requestBattery() {
    if (getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName())) return;
    try { startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); }
    catch (Exception e) { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
  }

  private void paste() {
    ClipboardManager clipboard = getSystemService(ClipboardManager.class);
    ClipData clip = clipboard.getPrimaryClip();
    CharSequence text = clip != null && clip.getItemCount() > 0 ? clip.getItemAt(0).coerceToText(this) : null;
    if (text == null || text.toString().trim().isEmpty()) { toast(R.string.clipboard_empty); return; }
    offer(text.toString());
  }

  /**
   * 链接可能来自网页或别的 App，不能直接改配置（否则可以把画面引到别的服务器）：
   * 先让手机主人确认服务器地址，确认后才填入并保存。
   */
  private void offer(String link) {
    if (link == null) return;
    Endpoint.Pairing pairing;
    try { pairing = Endpoint.parse(link); }
    catch (Endpoint.PairingException e) {
      toast(switch (e.reason) {
        case NOT_PAIRING -> R.string.not_pairing;
        case VERSION -> R.string.version_unsupported;
        case PUBLIC_HTTP -> R.string.public_http;
        default -> R.string.pairing_invalid;
      });
      return;
    }
    String message = getString(R.string.confirm_server, Endpoint.origin(pairing.url));
    if (pairing.url.startsWith("http:")) message += "\n\n" + getString(R.string.http_warning);
    new AlertDialog.Builder(this).setTitle(R.string.confirm_title).setMessage(message)
      .setPositiveButton(R.string.confirm, (dialog, which) -> {
        url.setText(pairing.url);
        device.setText(pairing.device);
        token.setText(pairing.token);
        save();
      })
      .setNegativeButton(R.string.cancel, null).show();
  }

  private void save() {
    if (!valid()) { toast(Endpoint.check(url.getText().toString()) == Endpoint.Check.PUBLIC_HTTP ? R.string.public_http : R.string.invalid); return; }
    prefs.edit().putLong("epoch", prefs.getLong("epoch", 0) + 1).putBoolean("enabled", false).putString("url", Endpoint.normalize(url.getText().toString()))
      .putString("device", device.getText().toString().trim()).putString("token", token.getText().toString().trim())
      .putInt("status", R.string.paused).apply();
    toast(R.string.saved);
    render();
  }

  private boolean valid() {
    return Endpoint.check(url.getText().toString()) == Endpoint.Check.OK
      && device.getText().toString().trim().matches("[a-f0-9]{32}")
      && token.getText().toString().trim().matches("[a-f0-9]{64}");
  }

  // ───────── 界面零件 ─────────

  /** 准备工作清单的一行：名称 + 状态（绿 / 黄）+ 未完成时的操作按钮 */
  private final class Check {
    final TextView state;
    final Button action;
    Check(LinearLayout parent, int title, int actionTitle, Runnable onClick) {
      LinearLayout row = new LinearLayout(MainActivity.this);
      row.setOrientation(LinearLayout.HORIZONTAL);
      row.setGravity(Gravity.CENTER_VERTICAL);
      row.setMinimumHeight(dp(48));
      LinearLayout labels = new LinearLayout(MainActivity.this);
      labels.setOrientation(LinearLayout.VERTICAL);
      labels.addView(text(title, 15, R.color.text));
      state = text(0, 13, R.color.muted);
      labels.addView(state);
      row.addView(labels, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
      action = small(actionTitle, onClick);
      row.addView(action);
      parent.addView(row);
    }
    void set(boolean done, int doneText, int todoText) {
      state.setText(done ? doneText : todoText);
      state.setTextColor(getColor(done ? R.color.good : R.color.warn));
      action.setVisibility(done ? View.GONE : View.VISIBLE);
    }
  }

  private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

  private GradientDrawable shape(int fill, int stroke, int radius) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(getColor(fill));
    if (stroke != 0) drawable.setStroke(dp(1), getColor(stroke));
    drawable.setCornerRadius(dp(radius));
    return drawable;
  }

  private LinearLayout.LayoutParams margins(int left, int top, int right, int bottom) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    params.setMargins(left, top, right, bottom);
    return params;
  }

  private LinearLayout.LayoutParams weight(int left, int right) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
    params.setMargins(left, 0, right, 0);
    return params;
  }

  private LinearLayout card(LinearLayout page) {
    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setPadding(dp(16), dp(16), dp(16), dp(16));
    card.setBackground(shape(R.color.card, R.color.line, 16));
    page.addView(card, margins(0, 0, 0, dp(12)));
    return card;
  }

  private TextView text(int id, int sp, int color) {
    TextView view = new TextView(this);
    if (id != 0) view.setText(id);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
    view.setTextColor(getColor(color));
    view.setLineSpacing(0, 1.15f);
    return view;
  }

  private TextView heading(int id) {
    TextView view = text(id, 16, R.color.text);
    view.setTypeface(Typeface.DEFAULT_BOLD);
    view.setPadding(0, 0, 0, dp(10));
    return view;
  }

  private TextView label(int id) {
    TextView view = text(id, 13, R.color.muted);
    view.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
    view.setPadding(0, 0, 0, dp(2));
    return view;
  }

  private TextView link(LinearLayout parent, int id) {
    TextView view = text(id, 14, R.color.accent);
    view.setPadding(0, dp(12), 0, dp(4));
    view.setBackground(ripple(null));
    parent.addView(view);
    return view;
  }

  private RippleDrawable ripple(GradientDrawable content) {
    return new RippleDrawable(ColorStateList.valueOf(getColor(R.color.line)), content, content == null ? shape(R.color.line, 0, 10) : null);
  }

  /** 44dp 高的按钮：主按钮紫色实心，次要按钮描边 */
  private Button button(LinearLayout parent, int title, boolean primary, Runnable onClick) {
    Button button = new Button(this);
    if (title != 0) button.setText(title);
    button.setAllCaps(false);
    button.setStateListAnimator(null);
    button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    button.setTextColor(getColor(primary ? R.color.on_accent : R.color.text));
    button.setBackground(ripple(primary ? shape(R.color.accent, 0, 12) : shape(R.color.card, R.color.line, 12)));
    button.setMinHeight(dp(44));
    button.setMinimumHeight(dp(44));
    button.setOnClickListener(view -> onClick.run());
    parent.addView(button, margins(0, dp(6), 0, 0));
    return button;
  }

  private Button small(int title, Runnable onClick) {
    Button button = new Button(this);
    button.setText(title);
    button.setAllCaps(false);
    button.setStateListAnimator(null);
    button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
    button.setTextColor(getColor(R.color.accent));
    button.setBackground(ripple(shape(R.color.card, R.color.line, 10)));
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setMinHeight(dp(34));
    button.setMinimumHeight(dp(34));
    button.setPadding(dp(12), 0, dp(12), 0);
    button.setOnClickListener(view -> onClick.run());
    return button;
  }

  private EditText input(LinearLayout parent, int hint, String key, boolean secret) {
    EditText field = new EditText(this);
    field.setHint(hint);
    field.setSingleLine(true);
    field.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
    field.setTextColor(getColor(R.color.text));
    field.setHintTextColor(getColor(R.color.muted));
    field.setBackground(shape(R.color.soft, R.color.line, 10));
    field.setPadding(dp(12), dp(10), dp(12), dp(10));
    field.setInputType(InputType.TYPE_CLASS_TEXT | (secret ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_VARIATION_URI));
    field.setImportantForAutofill(EditText.IMPORTANT_FOR_AUTOFILL_NO);
    field.setText(prefs.getString(key, ""));
    parent.addView(field, margins(0, dp(8), 0, 0));
    return field;
  }

  /** 一组单选，选中值直接存进 prefs[key]，并回调给界面（比如显示 / 隐藏关联设置） */
  private void radios(LinearLayout parent, String key, String fallback, int[] titles, String[] values, java.util.function.Consumer<String> changed) {
    RadioGroup group = new RadioGroup(this);
    String current = prefs.getString(key, fallback);
    for (int i = 0; i < titles.length; i++) {
      RadioButton radio = new RadioButton(this);
      radio.setId(View.generateViewId());
      radio.setText(titles[i]);
      radio.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
      radio.setTextColor(getColor(R.color.text));
      radio.setPadding(dp(4), dp(8), 0, dp(8));
      String value = values[i];
      group.addView(radio);
      if (value.equals(current)) group.check(radio.getId());
      radio.setOnCheckedChangeListener((view, checked) -> {
        if (!checked) return;
        prefs.edit().putString(key, value).apply();
        changed.accept(value);
      });
    }
    parent.addView(group);
  }

  private void toast(int message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
  @Override public void onResume() {
    super.onResume();
    handler.post(refresh);
    if (System.currentTimeMillis() - prefs.getLong("updateChecked", 0) > Updater.AUTO_INTERVAL) checkUpdate(false);
  }
  @Override public void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
}
