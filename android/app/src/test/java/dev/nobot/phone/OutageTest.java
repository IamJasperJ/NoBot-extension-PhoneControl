package dev.nobot.phone;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class OutageTest {
  @Test public void longGapBetweenLoopsMeansFrozen() {
    Outage outage = new Outage();
    outage.tick(1000);
    outage.tick(5000);
    outage.tick(305000);
    // 被冻结期间的请求失败不覆盖原因
    outage.failed(305100, "SocketTimeoutException");
    Outage.Report report = outage.succeeded(306000);
    assertEquals("frozen", report.cause);
    assertEquals(301000, report.offlineMs);
  }

  @Test public void repeatedFailuresMeanNetwork() {
    Outage outage = new Outage();
    outage.tick(1000);
    outage.failed(2000, "ConnectException: failed to connect");
    outage.tick(17000);
    outage.failed(17000, "ConnectException: again");
    Outage.Report report = outage.succeeded(62000);
    assertEquals("network", report.cause);
    assertEquals(60000, report.offlineMs);
    assertEquals("ConnectException: again", report.error);
    assertNull(outage.succeeded(70000));
  }

  @Test public void frozenDuringRequestStillCountsAsFrozen() {
    Outage outage = new Outage();
    outage.tick(1000);
    outage.failed(200000, "SocketTimeoutException");
    Outage.Report report = outage.succeeded(201000);
    assertEquals("frozen", report.cause);
    assertEquals(200000, report.offlineMs);
  }

  @Test public void networkOutageCountsFromLastSuccess() {
    Outage outage = new Outage();
    outage.ok(1000);
    outage.tick(1000);
    outage.failed(19000, "SocketTimeoutException");
    // 轮询前先取报告：不够上报门槛时清空，但下一次失败仍从上次成功算起
    assertNull(outage.succeeded(20000));
    outage.failed(38000, "SocketTimeoutException");
    Outage.Report report = outage.succeeded(40000);
    assertEquals("network", report.cause);
    assertEquals(39000, report.offlineMs);
  }

  @Test public void oversleptPollMeansFrozen() {
    Outage outage = new Outage();
    outage.slept(1000, 3000, 1500);
    assertNull(outage.succeeded(40000));
    outage.slept(50000, 85000, 4000);
    Outage.Report report = outage.succeeded(85000);
    assertEquals("frozen", report.cause);
    assertEquals(35000, report.offlineMs);
  }

  @Test public void shortBlipsAreNotReported() {
    Outage outage = new Outage();
    outage.failed(1000, "x");
    assertNull(outage.succeeded(15000));
  }

  @Test public void restartAndPause() {
    Outage outage = new Outage();
    outage.restarted(100000, 90000);
    assertEquals("restarted", outage.succeeded(100000).cause);
    outage.paused(200000);
    assertEquals(50000, outage.succeeded(250000).offlineMs);
  }

  @Test public void errorIsTruncated() {
    Outage outage = new Outage();
    outage.failed(1, "x".repeat(300));
    assertEquals(200, outage.succeeded(30001).error.length());
  }
}
