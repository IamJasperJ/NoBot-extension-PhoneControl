package dev.nobot.phone;

import static org.junit.Assert.*;
import org.junit.Test;

public class ControlLeaseTest {
  @Test public void pauseCancelsQueuedAndActiveActionsWithoutCancellingNextSession() {
    ControlLease lease = new ControlLease();
    long first = lease.ticket();
    assertTrue(lease.valid(first, 100, 50));
    lease.cancel();
    assertFalse(lease.valid(first, 100, 51));
    long next = lease.ticket();
    assertTrue(lease.valid(next, 100, 52));
    assertFalse(lease.valid(first, 100, 52));
  }

  @Test public void expiredActionsNeverExecute() {
    ControlLease lease = new ControlLease();
    assertTrue(lease.valid(lease.ticket(), 100, 99));
    assertFalse(lease.valid(lease.ticket(), 100, 100));
    assertFalse(lease.valid(lease.ticket(), 100, 101));
  }

  @Test public void timeoutIsDistinctFromUserCancellation() {
    ControlLease lease = new ControlLease();
    long ticket = lease.ticket();
    assertNull(lease.failure(ticket, 100, 99));
    assertEquals("SHIZUKU_TIMEOUT", lease.failure(ticket, 100, 100));
    lease.cancel();
    assertEquals("CANCELLED", lease.failure(ticket, 100, 100));
  }

  @Test public void existingUsersAndUnknownSettingsUseOriginalMode() {
    assertFalse(ControlMode.privileged(null));
    assertFalse(ControlMode.privileged("accessibility"));
    assertFalse(ControlMode.privileged("root"));
    assertTrue(ControlMode.privileged("shizuku"));
  }
}
