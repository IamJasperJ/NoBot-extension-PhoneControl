package dev.nobot.phone;

import java.io.UnsupportedEncodingException;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.Map;

/** 手机入口与配对链接的纯逻辑；不依赖 Android 界面，便于 JVM 单元测试。 */
final class Endpoint {
  private Endpoint() {}

  enum Check { OK, INVALID, PUBLIC_HTTP }
  enum Reason { NOT_PAIRING, VERSION, INVALID, PUBLIC_HTTP }

  static final class Pairing {
    final String url, device, token;
    Pairing(String url, String device, String token) { this.url = url; this.device = device; this.token = token; }
  }

  static final class PairingException extends Exception {
    final Reason reason;
    PairingException(Reason reason) { super(reason.name()); this.reason = reason; }
  }

  static String normalize(String raw) { return raw.trim().replaceAll("/+$", ""); }

  /**
   * 保存前检查入口。HTTP 只给内网 / VPN 用：IP 字面量在这里直接判断；
   * 域名无法提前解析，放行后由 {@link PhoneService} 每次请求前检查解析结果。
   */
  static Check check(String raw) {
    try {
      URI uri = new URI(normalize(raw));
      String host = uri.getHost();
      if (host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
          || uri.getPath() == null || !uri.getPath().matches(".*/hooks/phone-control/[^/]+/?")) return Check.INVALID;
      if ("https".equals(uri.getScheme())) return Check.OK;
      if (!"http".equals(uri.getScheme())) return Check.INVALID;
      if (looksLikeIpv4(host) && !validIpv4(host)) return Check.INVALID;
      InetAddress literal = literal(host);
      if (literal == null && host.startsWith("[")) return Check.INVALID;
      return literal == null || isPrivate(literal) ? Check.OK : Check.PUBLIC_HTTP;
    } catch (URISyntaxException e) {
      return Check.INVALID;
    }
  }

  /** 只解析 IP 字面量，域名返回 null；绝不触发 DNS 查询。 */
  static InetAddress literal(String host) {
    try {
      if (host.startsWith("[") && host.endsWith("]")) return InetAddress.getByName(host);
      if (validIpv4(host)) return InetAddress.getByName(host);
    } catch (UnknownHostException ignored) {}
    return null;
  }

  private static boolean looksLikeIpv4(String host) { return host.matches("\\d+(\\.\\d+){3}"); }
  private static boolean validIpv4(String host) {
    if (!host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return false;
    for (String part : host.split("\\.")) if (Integer.parseInt(part) > 255) return false;
    return true;
  }

  /** 内网、本机、链路本地，以及 Tailscale 等 VPN 常用的 100.64.0.0/10。 */
  static boolean isPrivate(InetAddress address) {
    byte[] b = address.getAddress();
    if (b.length == 16) {
      boolean mapped = (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff;
      for (int i = 0; i < 10 && mapped; i++) mapped = b[i] == 0;
      if (mapped) b = new byte[] { b[12], b[13], b[14], b[15] };
    }
    if (b.length == 4) {
      int a = b[0] & 0xff, c = b[1] & 0xff;
      return a == 10 || a == 127 || (a == 172 && c >= 16 && c <= 31) || (a == 192 && c == 168)
        || (a == 100 && c >= 64 && c <= 127) || (a == 169 && c == 254);
    }
    return address.isLoopbackAddress() || (b[0] & 0xfe) == 0xfc || ((b[0] & 0xff) == 0xfe && (b[1] & 0xc0) == 0x80);
  }

  /** 解析网页二维码里的 nobot-phone://pair 链接，格式见 PROTOCOL.md。 */
  static Pairing parse(String text) throws PairingException {
    URI uri;
    try { uri = new URI(text.trim()); }
    catch (URISyntaxException e) {
      // 是配对链接但编码坏了（比如手动复制时截断），提示重新生成，而不是「不是配对码」。
      throw new PairingException(text.trim().startsWith("nobot-phone://pair") ? Reason.INVALID : Reason.NOT_PAIRING);
    }
    if (!"nobot-phone".equals(uri.getScheme()) || !"pair".equals(uri.getHost())) throw new PairingException(Reason.NOT_PAIRING);
    Map<String, String> query = new HashMap<>();
    if (uri.getRawQuery() != null) {
      for (String part : uri.getRawQuery().split("&")) {
        int split = part.indexOf('=');
        if (split <= 0) continue;
        try { query.put(part.substring(0, split), URLDecoder.decode(part.substring(split + 1), "UTF-8")); }
        catch (IllegalArgumentException | UnsupportedEncodingException e) { throw new PairingException(Reason.INVALID); }
      }
    }
    String version = query.get("v");
    if (version == null) throw new PairingException(Reason.INVALID);
    if (!"1".equals(version)) throw new PairingException(Reason.VERSION);
    String url = normalize(query.getOrDefault("url", ""));
    String device = query.getOrDefault("device", "").trim(), token = query.getOrDefault("token", "").trim();
    Check check = check(url);
    if (check == Check.PUBLIC_HTTP) throw new PairingException(Reason.PUBLIC_HTTP);
    if (check != Check.OK || !device.matches("[a-f0-9]{32}") || !token.matches("[a-f0-9]{64}"))
      throw new PairingException(Reason.INVALID);
    return new Pairing(url, device, token);
  }

  /** 确认框里只显示协议、主机和端口，路径里的账号 handle 不必占位置。 */
  static String origin(String url) {
    try {
      URI uri = new URI(url);
      return uri.getScheme() + "://" + uri.getHost() + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
    } catch (URISyntaxException e) {
      return url;
    }
  }
}
