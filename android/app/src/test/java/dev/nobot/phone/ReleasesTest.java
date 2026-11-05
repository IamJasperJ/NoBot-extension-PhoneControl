package dev.nobot.phone;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ReleasesTest {
  @Test public void comparesVersionsSegmentBySegment() {
    assertTrue(Releases.compare("v0.5.8", "0.5.7") > 0);
    assertTrue(Releases.compare("0.5.10", "0.5.9") > 0);
    assertTrue(Releases.compare("v0.6", "0.5.99") > 0);
    assertTrue(Releases.compare("0.5.7", "v0.5.8") < 0);
    assertEquals(0, Releases.compare("v0.5.7", "0.5.7"));
    assertEquals(0, Releases.compare("0.5", "0.5.0"));
    // 预发布后缀只看数字部分
    assertEquals(0, Releases.compare("0.6.0-beta", "0.6.0"));
    assertTrue(Releases.compare("garbage", "0.0.1") < 0);
  }

  @Test public void findsChecksumForFile() {
    String apk = "a".repeat(64), zip = "B".repeat(64);
    String sums = apk + "  nobot-phone-0.5.8.apk\n" + zip + " *phone-control-0.5.8.zip\r\n";
    assertEquals(apk, Releases.checksum(sums, "nobot-phone-0.5.8.apk"));
    assertEquals("b".repeat(64), Releases.checksum(sums, "phone-control-0.5.8.zip"));
    assertNull(Releases.checksum(sums, "nobot-phone-0.5.7.apk"));
    assertNull(Releases.checksum("1234  nobot-phone-0.5.8.apk", "nobot-phone-0.5.8.apk"));
    assertNull(Releases.checksum(null, "x"));
  }

  @Test public void recognizesReleaseApk() {
    assertTrue(Releases.isApk("nobot-phone-0.5.8.apk"));
    assertFalse(Releases.isApk("phone-control-0.5.8.zip"));
    assertFalse(Releases.isApk("other.apk"));
  }
}
