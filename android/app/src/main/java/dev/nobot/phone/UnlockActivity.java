package dev.nobot.phone;

import android.app.Activity;
import android.app.KeyguardManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

/**
 * 透明页面：点亮屏幕并请求解除锁屏。只有无密码（滑动解锁）或 Smart Lock 信任时能成功；
 * 无障碍服务本身不能亮屏也不能解锁，只能借一个 Activity。
 */
public class UnlockActivity extends Activity {
  private final Handler handler = new Handler(Looper.getMainLooper());

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    setShowWhenLocked(true);
    setTurnScreenOn(true);
    KeyguardManager keyguard = getSystemService(KeyguardManager.class);
    if (!keyguard.isKeyguardLocked()) { finish(); return; }
    keyguard.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
      @Override public void onDismissSucceeded() { finish(); }
      @Override public void onDismissError() { finish(); }
      @Override public void onDismissCancelled() { finish(); }
    });
    // 回调没来（个别系统）也不能一直盖在屏幕上
    handler.postDelayed(this::finish, 3000);
  }

  @Override public void onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy(); }
}
