package dev.nobot.phone;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.os.Binder;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import rikka.shizuku.Shizuku;
import org.json.JSONObject;

/** 独立于旧的面板通道；不重试已交付动作，读管道也受超时和暂停控制。 */
final class ControlClient {
  private final Context context;
  private final Binder token = new Binder();
  private final ControlLease lease = new ControlLease();
  private final ExecutorService reader = Executors.newSingleThreadExecutor();
  private volatile IControl service;
  private volatile ParcelFileDescriptor active;
  private volatile ServiceConnection connection;
  private volatile boolean attached;
  private Shizuku.UserServiceArgs args;
  private volatile boolean closed;

  ControlClient(Context context) { this.context = context.getApplicationContext(); }

  JSONObject execute(JSONObject command) {
    long ticket = lease.ticket();
    long deadline = SystemClock.elapsedRealtime() + 8500;
    try {
      Privileged.check(Privileged.SHIZUKU);
      if (closed || !lease.valid(ticket, deadline, SystemClock.elapsedRealtime())) return ShellControl.result(false, "CANCELLED");
      IControl bound = bind(deadline);
      if (closed || !lease.valid(ticket, deadline, SystemClock.elapsedRealtime())) return ShellControl.result(false, "CANCELLED");
      ParcelFileDescriptor pipe = bound.execute(command.toString(), deadline);
      active = pipe;
      try {
        if (closed || !lease.valid(ticket, deadline, SystemClock.elapsedRealtime())) { cancel(); return ShellControl.result(false, "CANCELLED"); }
        Future<JSONObject> response = reader.submit(() -> {
          try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
              if (output.size() + count > 3000000) throw new IllegalStateException("PAYLOAD_TOO_LARGE");
              output.write(buffer, 0, count);
            }
            return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
          }
        });
        try { return response.get(Math.max(1, deadline - SystemClock.elapsedRealtime()), TimeUnit.MILLISECONDS); }
        finally { if (!response.isDone()) response.cancel(true); }
      } finally {
        active = null;
        pipe.close();
      }
    } catch (Privileged.Unavailable error) {
      return ShellControl.result(false, error.message == R.string.shizuku_permission ? "SHIZUKU_PERMISSION_REQUIRED" : "SHIZUKU_UNAVAILABLE");
    } catch (TimeoutException error) {
      cancel();
      return ShellControl.result(false, "SHIZUKU_TIMEOUT");
    } catch (Exception error) {
      String failure = lease.failure(ticket, deadline, SystemClock.elapsedRealtime());
      if (failure != null || closed) {
        cancel();
        return ShellControl.result(false, closed ? "CANCELLED" : failure);
      }
      return ShellControl.result(false, "SHIZUKU_CONTROL_FAILED");
    }
  }

  private synchronized IControl bind(long deadline) throws Exception {
    if (closed) throw new IllegalStateException("CANCELLED");
    if (attached && service != null && service.asBinder().pingBinder()) return service;
    unbind();
    CountDownLatch ready = new CountDownLatch(1);
    args = new Shizuku.UserServiceArgs(new ComponentName(context, ControlUserService.class))
      .daemon(false).processNameSuffix("control").version(BuildConfig.VERSION_CODE).debuggable(BuildConfig.DEBUG);
    connection = new ServiceConnection() {
      @Override public void onServiceConnected(ComponentName name, IBinder binder) {
        if (closed || connection != this) return;
        service = IControl.Stub.asInterface(binder);
        ready.countDown();
      }
      @Override public void onServiceDisconnected(ComponentName name) { if (connection == this) service = null; }
    };
    Shizuku.bindUserService(args, connection);
    if (!ready.await(Math.max(1, Math.min(3000, deadline - SystemClock.elapsedRealtime())), TimeUnit.MILLISECONDS) || service == null)
      throw new TimeoutException();
    service.attach(token);
    attached = true;
    return service;
  }

  void cancel() {
    lease.cancel();
    IControl current = service;
    if (current != null) try { current.cancel(); } catch (Exception ignored) {}
    ParcelFileDescriptor pipe = active;
    if (pipe != null) try { pipe.close(); } catch (Exception ignored) {}
  }

  private void unbind() {
    if (connection != null) {
      try { Shizuku.unbindUserService(args, connection, true); } catch (Exception ignored) {}
      connection = null;
      service = null;
      attached = false;
    }
  }

  void close() {
    closed = true;
    cancel();
    synchronized (this) { unbind(); }
    reader.shutdownNow();
  }
}
