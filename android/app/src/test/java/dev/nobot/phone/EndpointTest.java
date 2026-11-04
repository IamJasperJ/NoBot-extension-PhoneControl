package dev.nobot.phone;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import org.junit.Test;

public class EndpointTest {
  private static final String PATH = "/hooks/phone-control/owner";
  private static final String DEVICE = "0123456789abcdef0123456789abcdef";
  private static final String TOKEN = DEVICE + DEVICE;

  private static String link(String url) throws Exception {
    return "nobot-phone://pair?v=1&url=" + java.net.URLEncoder.encode(url, "UTF-8") + "&device=" + DEVICE + "&token=" + TOKEN;
  }
  private static void rejects(String text, Endpoint.Reason reason) {
    try { Endpoint.parse(text); fail(text); } catch (Endpoint.PairingException e) { assertEquals(text, reason, e.reason); }
  }

  @Test public void httpsAnyHost() {
    assertEquals(Endpoint.Check.OK, Endpoint.check("https://nobot.example.com" + PATH));
    assertEquals(Endpoint.Check.OK, Endpoint.check("https://8.8.8.8" + PATH + "/"));
  }

  @Test public void httpOnlyPrivate() {
    for (String host : new String[] { "192.168.1.5:3000", "10.0.0.2", "172.20.1.1", "100.100.1.1", "[fd00::1]", "[fe80::1]", "127.0.0.1", "169.254.3.4", "nas.lan", "box.tail1234.ts.net" })
      assertEquals(host, Endpoint.Check.OK, Endpoint.check("http://" + host + PATH));
    for (String host : new String[] { "8.8.8.8", "172.32.0.1", "100.128.0.1", "[2001:db8::1]", "192.169.0.1" })
      assertEquals(host, Endpoint.Check.PUBLIC_HTTP, Endpoint.check("http://" + host + PATH));
  }

  @Test public void malformed() {
    for (String url : new String[] { "https://a.com" + PATH + "?x=1", "https://u:p@a.com" + PATH, "https://a.com/hooks/other/owner", "https://a.com" + PATH + "#x", "ftp://a.com" + PATH, "http://999.1.1.1" + PATH, "http://[zz::1]" + PATH, "" })
      assertEquals(url, Endpoint.Check.INVALID, Endpoint.check(url));
  }

  @Test public void parsesPairingLink() throws Exception {
    Endpoint.Pairing p = Endpoint.parse(link("http://192.168.1.5:3100/nobot" + PATH));
    assertEquals("http://192.168.1.5:3100/nobot" + PATH, p.url);
    assertEquals(DEVICE, p.device);
    assertEquals(TOKEN, p.token);
    // 参数顺序不固定
    p = Endpoint.parse("nobot-phone://pair?token=" + TOKEN + "&device=" + DEVICE + "&url=https%3A%2F%2Fa.com" + PATH.replace("/", "%2F") + "&v=1");
    assertEquals("https://a.com" + PATH, p.url);
    assertEquals("http://192.168.1.5:3100", Endpoint.origin("http://192.168.1.5:3100/nobot" + PATH));
  }

  @Test public void rejectsBadLinks() throws Exception {
    rejects("https://a.com", Endpoint.Reason.NOT_PAIRING);
    rejects("hello world", Endpoint.Reason.NOT_PAIRING);
    rejects(link("https://a.com" + PATH).replace("v=1", "v=2"), Endpoint.Reason.VERSION);
    rejects(link("https://a.com" + PATH).replace("v=1&", ""), Endpoint.Reason.INVALID);
    rejects(link("https://a.com" + PATH).replace("&device=" + DEVICE, ""), Endpoint.Reason.INVALID);
    rejects(link("https://a.com" + PATH).replace(DEVICE + "&", "abc&"), Endpoint.Reason.INVALID);
    rejects(link("http://8.8.8.8" + PATH), Endpoint.Reason.PUBLIC_HTTP);
    rejects("nobot-phone://pair?v=1&url=%zz&device=" + DEVICE + "&token=" + TOKEN, Endpoint.Reason.INVALID);
  }
}
