package dev.nobot.phone;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class PanelSessionTest {
  @Test public void newTaskRequestsPanelWithoutNeedingWake() {
    PanelSession session = new PanelSession();
    session.begin("task-1", true);
    assertTrue(session.requested());
    session.begin("task-1", true);
    assertTrue(session.requested());
  }

  @Test public void manualReleaseSurvivesFurtherStepsButNotNewTask() {
    PanelSession session = new PanelSession();
    session.begin("task-1", true);
    session.release();
    session.begin("task-1", true);
    assertFalse(session.requested());
    session.begin("task-2", true);
    assertTrue(session.requested());
  }

  @Test public void wakeModeNeverAutomaticallyRequestsPanel() {
    PanelSession session = new PanelSession();
    session.begin("task-1", false);
    assertFalse(session.requested());
    session.begin("task-2", true);
    session.begin("task-2", false);
    assertFalse(session.requested());
    session.begin("task-2", true);
    assertFalse(session.requested());
  }

  @Test public void manualHoldCanResumeCurrentTask() {
    PanelSession session = new PanelSession();
    session.begin("task-1", true);
    session.release();
    session.hold();
    session.begin("task-1", true);
    assertTrue(session.requested());
  }
}
