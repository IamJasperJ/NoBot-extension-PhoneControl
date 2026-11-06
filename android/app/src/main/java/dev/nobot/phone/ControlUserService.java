package dev.nobot.phone;

import android.os.Binder;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.os.RemoteException;
import android.os.SystemClock;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** 特权服务只接受协议动作，不开放任意 shell；每条动作串行执行且有取消和过期检查。 */
public final class ControlUserService extends IControl.Stub {
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final ControlLease lease = new ControlLease();
  private final ShellControl control = new ShellControl();
  private int owner = -1;
  private boolean closing;

  public ControlUserService() {}

  @Override public synchronized void attach(IBinder client) throws RemoteException {
    if (owner != -1 && owner != Binder.getCallingUid()) throw new SecurityException();
    if (owner != -1) return;
    owner = Binder.getCallingUid();
    client.linkToDeath(this::shutdown, 0);
  }

  private synchronized void authorize() {
    if (closing || owner == -1 || owner != Binder.getCallingUid()) throw new SecurityException();
  }

  @Override public ParcelFileDescriptor execute(String request, long deadline) {
    authorize();
    if (request == null || request.length() > 16000) throw new IllegalArgumentException("INVALID_INPUT");
    long ticket = lease.ticket();
    long expires = Math.min(deadline, SystemClock.elapsedRealtime() + 8500);
    try {
      ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createPipe();
      worker.execute(() -> {
        try (OutputStream out = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
          JSONObject result;
          try {
            result = control.execute(new JSONObject(request), () -> {
              String failure = lease.failure(ticket, expires, SystemClock.elapsedRealtime());
              if (failure != null) throw new IllegalStateException(failure);
            });
          } catch (Throwable error) {
            String message = error.getMessage();
            result = ShellControl.result(false, "CANCELLED".equals(message) || "SHIZUKU_TIMEOUT".equals(message)
              ? message : "SHIZUKU_CONTROL_FAILED");
          }
          out.write(result.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
          // 客户端取消后关闭读端，不能因此重复执行动作。
        }
      });
      return pipe[0];
    } catch (Exception error) { throw new IllegalStateException("SHIZUKU_CONTROL_FAILED"); }
  }

  @Override public void cancel() { authorize(); lease.cancel(); }
  @Override public void destroy() { shutdown(); }

  private synchronized void shutdown() {
    if (closing) return;
    closing = true;
    lease.cancel();
    worker.execute(() -> {
      control.close();
      System.exit(0);
    });
    worker.shutdown();
  }
}
