package dev.nobot.phone;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;

/**
 * 看门狗闹钟：控制开启期间每 5 分钟唤醒一次（Doze 下系统可能推迟到约 9 分钟）。
 * 万一前台服务也没挡住冻结，闹钟到点会让进程恢复运行，轮询线程接着跑，并补起前台服务。
 */
public class Watchdog extends BroadcastReceiver {
  static final long INTERVAL = 5 * 60_000;

  static void schedule(Context context) {
    context.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
      SystemClock.elapsedRealtime() + INTERVAL, intent(context));
  }

  static void cancel(Context context) { context.getSystemService(AlarmManager.class).cancel(intent(context)); }

  private static PendingIntent intent(Context context) {
    return PendingIntent.getBroadcast(context, 0, new Intent(context, Watchdog.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  @Override public void onReceive(Context context, Intent intent) {
    PhoneService service = PhoneService.instance;
    if (service == null || !service.controlling()) return;
    KeepAliveService.start(context);
    schedule(context);
  }
}
