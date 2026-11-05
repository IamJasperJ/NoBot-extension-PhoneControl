package dev.nobot.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

/** 接收 PackageInstaller 会话的结果：要用户确认时把确认界面交给主页打开，失败时记下原因。安装成功时进程会被系统结束。 */
public class UpdateReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      Intent confirm = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class) : legacy(intent);
      if (confirm == null) { Updater.fail(Updater.release, R.string.update_failed_install, ""); return; }
      Updater.confirm = confirm;
      return;
    }
    Updater.confirm = null;
    if (status == PackageInstaller.STATUS_SUCCESS) Updater.phase = Updater.Phase.IDLE;
    // 用户在确认框里点了取消：回到「有新版本」，可以再点一次
    else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) Updater.phase = Updater.Phase.AVAILABLE;
    else Updater.fail(Updater.release, R.string.update_failed_install, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
  }

  @SuppressWarnings("deprecation") // Android 12 及以下没有带类型的版本
  private static Intent legacy(Intent intent) { return intent.getParcelableExtra(Intent.EXTRA_INTENT); }
}
