package dev.nobot.phone;

import android.os.ParcelFileDescriptor;

// 独立的 Shizuku 控制通道，结果用管道传输，避免截图超过 Binder 单次大小限制。
interface IControl {
  void destroy() = 16777114;
  void attach(IBinder client) = 1;
  ParcelFileDescriptor execute(String request, long deadline) = 2;
  void cancel() = 3;
}
