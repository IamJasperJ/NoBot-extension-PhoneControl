package dev.nobot.phone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.IBinder;

/**
 * 控制开启期间的前台服务，只负责常驻通知。
 * 无障碍服务本身不算前台服务，iQOO 等系统熄屏约一分钟就会冻结 App，轮询随之停止（网络和 EasyTier 都还通）；
 * 同一进程里有前台服务时进程优先级高，系统不会冻结它。
 */
public class KeepAliveService extends Service {
  static final String CHANNEL = "control";
  static final int ID = 1;

  static void start(Context context) {
    try { context.startForegroundService(new Intent(context, KeepAliveService.class)); }
    // 后台启动前台服务受限（Android 12+）时退回普通常驻通知，由看门狗闹钟下次再试
    catch (RuntimeException e) { PhoneService.fallbackNotification(context); }
  }

  static void stop(Context context) { context.stopService(new Intent(context, KeepAliveService.class)); }

  static Notification build(Context context) {
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    manager.createNotificationChannel(new NotificationChannel(CHANNEL, context.getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW));
    PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    return new Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_view)
      .setContentTitle(context.getString(R.string.app_name)).setContentText(context.getString(R.string.active))
      .setContentIntent(open).setOngoing(true).build();
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    try {
      // Android 14 起前台服务必须声明类型；更早的系统没有 specialUse，直接启动
      if (android.os.Build.VERSION.SDK_INT >= 34) startForeground(ID, build(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
      else startForeground(ID, build(this));
    }
    catch (RuntimeException e) {
      // 系统不让转前台（后台启动限制等）：退回普通通知，看门狗下次再试
      PhoneService.fallbackNotification(this);
      stopSelf();
      return START_NOT_STICKY;
    }
    PhoneService service = PhoneService.instance;
    if (service == null || !service.controlling()) stopSelf();
    // 不让系统自动重启：控制是否开启以 PhoneService 为准，被杀后由看门狗补起
    return START_NOT_STICKY;
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
