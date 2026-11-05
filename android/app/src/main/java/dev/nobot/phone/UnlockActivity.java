package dev.nobot.phone;

import android.app.Activity;
import android.app.KeyguardManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

/** 先让页面真正恢复到前台并亮屏，再解除无密码锁屏；不能在 onCreate 提前退出。 */
public class UnlockActivity extends Activity {
  private final Handler handler = new Handler(Looper.getMainLooper());
  private long deadline;
  private boolean dismissRequested;
  private final Runnable check = new Runnable() {
    @Override public void run() {
      if (isFinishing() || isDestroyed()) return;
      PowerManager power = getSystemService(PowerManager.class);
      KeyguardManager keyguard = getSystemService(KeyguardManager.class);
      if (Screen.wakeReady(power.isInteractive(), keyguard.isKeyguardLocked())) { finish(); return; }
      if (SystemClock.elapsedRealtime() >= deadline) { finish(); return; }
      // 等窗口可见后再请求解除，避免页面尚未显示时系统直接拒绝。
      if (hasWindowFocus() && keyguard.isKeyguardLocked() && !dismissRequested) {
        dismissRequested = true;
        keyguard.requestDismissKeyguard(UnlockActivity.this, new KeyguardManager.KeyguardDismissCallback() {
          @Override public void onDismissSucceeded() { scheduleCheck(); }
          @Override public void onDismissError() { finish(); }
          @Override public void onDismissCancelled() { finish(); }
        });
      }
      handler.postDelayed(this, 100);
    }
  };

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    setShowWhenLocked(true);
    setTurnScreenOn(true);
    deadline = SystemClock.elapsedRealtime() + 4000;
    // 没有锁屏也不能立即 finish：setTurnScreenOn 要等 Activity resumed 才能生效。
    handler.postDelayed(this::finish, 4000);
  }

  @Override protected void onResume() {
    super.onResume();
    scheduleCheck();
  }

  @Override public void onWindowFocusChanged(boolean focused) {
    super.onWindowFocusChanged(focused);
    if (focused) scheduleCheck();
  }

  private void scheduleCheck() {
    handler.removeCallbacks(check);
    handler.post(check);
  }

  @Override public void onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy(); }
}
