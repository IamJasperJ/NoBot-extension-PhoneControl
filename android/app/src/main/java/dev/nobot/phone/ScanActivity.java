package dev.nobot.phone;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Camera;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.ReaderException;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * App 内扫码。用旧版 Camera API + zxing-core：不依赖 AndroidX / CameraX / Google Play 服务，
 * 很多国产手机没有 GMS，系统扫码对自定义链接的支持也不一致。
 */
@SuppressWarnings("deprecation")
public class ScanActivity extends Activity implements SurfaceHolder.Callback, Camera.PreviewCallback {
  static final String EXTRA_LINK = "link";
  private FrameLayout root;
  private SurfaceView surface;
  private Camera camera;
  private int previewWidth, previewHeight;
  private boolean surfaceReady;
  private volatile boolean done;
  private long lastHint;
  private final AtomicBoolean decoding = new AtomicBoolean();
  private final ExecutorService decoder = Executors.newSingleThreadExecutor();
  private final QRCodeReader reader = new QRCodeReader();

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    root = new FrameLayout(this);
    root.setBackgroundColor(Color.BLACK);
    surface = new SurfaceView(this);
    surface.getHolder().addCallback(this);
    root.addView(surface, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
    LinearLayout bar = new LinearLayout(this);
    bar.setOrientation(LinearLayout.VERTICAL);
    bar.setGravity(Gravity.CENTER_HORIZONTAL);
    bar.setPadding(32, 32, 32, 64);
    bar.setBackgroundColor(0x99000000);
    TextView hint = new TextView(this);
    hint.setText(R.string.scan_hint);
    hint.setTextColor(Color.WHITE);
    hint.setGravity(Gravity.CENTER);
    bar.addView(hint);
    Button cancel = new Button(this);
    cancel.setText(R.string.cancel);
    cancel.setOnClickListener(view -> finish());
    bar.addView(cancel);
    root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
    setContentView(root);
    if (!granted()) requestPermissions(new String[]{Manifest.permission.CAMERA}, 2);
  }

  private boolean granted() { return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED; }

  @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
    if (code != 2) return;
    if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) open();
    else { toast(R.string.camera_denied); finish(); }
  }

  @Override public void onResume() { super.onResume(); open(); }
  @Override public void onPause() { release(); super.onPause(); }
  @Override public void onDestroy() { decoder.shutdownNow(); super.onDestroy(); }
  @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; open(); }
  @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}
  @Override public void surfaceDestroyed(SurfaceHolder holder) { surfaceReady = false; release(); }

  private void open() {
    if (camera != null || !surfaceReady || !granted() || done) return;
    int id = -1;
    Camera.CameraInfo info = new Camera.CameraInfo();
    for (int i = 0; i < Camera.getNumberOfCameras(); i++) {
      Camera.getCameraInfo(i, info);
      if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) { id = i; break; }
    }
    try {
      if (id < 0) throw new IllegalStateException("NO_BACK_CAMERA");
      camera = Camera.open(id);
      Camera.Parameters params = camera.getParameters();
      // 选不超过 1080p 的最大预览尺寸：够清晰，解码也不会太慢。
      Camera.Size best = null;
      for (Camera.Size size : params.getSupportedPreviewSizes())
        if ((long) size.width * size.height <= 1920 * 1080 && (best == null || size.width * size.height > best.width * best.height)) best = size;
      if (best != null) params.setPreviewSize(best.width, best.height);
      List<String> modes = params.getSupportedFocusModes();
      if (modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) params.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
      else if (modes.contains(Camera.Parameters.FOCUS_MODE_AUTO)) params.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
      camera.setParameters(params);
      Camera.Size size = camera.getParameters().getPreviewSize();
      previewWidth = size.width;
      previewHeight = size.height;
      int rotation = switch (getDisplay().getRotation()) {
        case Surface.ROTATION_90 -> 90;
        case Surface.ROTATION_180 -> 180;
        case Surface.ROTATION_270 -> 270;
        case Surface.ROTATION_0 -> 0;
        default -> 0;
      };
      int orientation = (info.orientation - rotation + 360) % 360;
      camera.setDisplayOrientation(orientation);
      fit(orientation % 180 == 0 ? (float) previewWidth / previewHeight : (float) previewHeight / previewWidth);
      camera.setPreviewDisplay(surface.getHolder());
      camera.setPreviewCallback(this);
      camera.startPreview();
    } catch (Exception e) {
      release();
      toast(R.string.camera_failed);
      finish();
    }
  }

  /** 按预览比例铺满屏幕（多出的部分裁掉），避免画面被拉伸。 */
  private void fit(float ratio) {
    root.post(() -> {
      int width = root.getWidth(), height = root.getHeight();
      if (width == 0 || height == 0) return;
      FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) surface.getLayoutParams();
      if ((float) width / height > ratio) { params.width = width; params.height = Math.round(width / ratio); }
      else { params.height = height; params.width = Math.round(height * ratio); }
      surface.setLayoutParams(params);
    });
  }

  private void release() {
    if (camera == null) return;
    camera.setPreviewCallback(null);
    camera.stopPreview();
    camera.release();
    camera = null;
  }

  @Override public void onPreviewFrame(byte[] data, Camera source) {
    // 同时只解一帧；解码慢于预览时直接丢掉中间的帧。
    if (done || data == null || !decoding.compareAndSet(false, true)) return;
    int width = previewWidth, height = previewHeight;
    decoder.execute(() -> {
      try { decode(data, width, height); } finally { decoding.set(false); }
    });
  }

  private void decode(byte[] data, int width, int height) {
    String text;
    try {
      PlanarYUVLuminanceSource luminance = new PlanarYUVLuminanceSource(data, width, height, 0, 0, width, height, false);
      text = reader.decode(new BinaryBitmap(new HybridBinarizer(luminance))).getText();
    } catch (ReaderException | IllegalArgumentException e) {
      return;
    } finally {
      reader.reset();
    }
    if (text.startsWith("nobot-phone://")) {
      done = true;
      runOnUiThread(() -> {
        setResult(RESULT_OK, new Intent().putExtra(EXTRA_LINK, text));
        finish();
      });
    } else if (SystemClock.elapsedRealtime() - lastHint > 3000) {
      lastHint = SystemClock.elapsedRealtime();
      runOnUiThread(() -> toast(R.string.not_pairing));
    }
  }

  private void toast(int message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }
}
