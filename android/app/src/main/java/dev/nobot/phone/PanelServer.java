package dev.nobot.phone;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * Root 方式的特权进程入口：应用用 su 执行
 * {@code CLASSPATH=<apk> app_process /system/bin dev.nobot.phone.PanelServer}，
 * 通过标准输入发 off / on，每条回一行 ok 或 error。标准输入关闭（应用退出）时恢复面板。
 */
public final class PanelServer {
  private PanelServer() {}

  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    PrintStream out = System.out;
    String line;
    while ((line = in.readLine()) != null) {
      if (!line.equals("on") && !line.equals("off")) continue;
      Throwable error = null;
      try { Panel.set(line.equals("on")); } catch (Throwable e) { error = e; }
      out.println(Panel.reply(error));
      out.flush();
    }
    try { Panel.set(true); } catch (Throwable ignored) {}
  }
}
