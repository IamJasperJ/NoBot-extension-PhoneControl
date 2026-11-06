package dev.nobot.phone;

import static org.junit.Assert.*;
import org.junit.Test;

public class TouchTrackTest {
  @Test public void holdMoveAndRestKeepOneContinuousFinger() {
    TouchTrack track = new TouchTrack(new float[]{10, 20, 110, 20}, 500, 1000, 300);
    assertEquals(1800, track.total());
    assertArrayEquals(new float[]{10, 20}, track.at(0), 0.001f);
    assertArrayEquals(new float[]{10, 20}, track.at(500), 0.001f);
    assertArrayEquals(new float[]{60, 20}, track.at(1000), 0.001f);
    assertArrayEquals(new float[]{110, 20}, track.at(1500), 0.001f);
    assertArrayEquals(new float[]{110, 20}, track.at(1800), 0.001f);
  }

  @Test public void curveUsesLengthAndKeepsWaypoints() {
    TouchTrack track = new TouchTrack(new float[]{0, 0, 100, 0, 100, 300}, 0, 1000, 0);
    assertArrayEquals(new float[]{100, 0}, track.at(250), 0.001f);
    assertArrayEquals(new float[]{100, 100}, track.at(500), 0.001f);
    assertArrayEquals(new float[]{100, 300}, track.at(1000), 0.001f);
  }

  @Test public void stationaryTapAndRepeatedPointsAreFinite() {
    TouchTrack track = new TouchTrack(new float[]{9, 8, 9, 8, 9, 8}, 0, 80, 0);
    assertArrayEquals(new float[]{9, 8}, track.at(40), 0.001f);
    assertArrayEquals(new float[]{9, 8}, track.at(80), 0.001f);
  }

  @Test public void validatesCoordinatesAndDurationsBeforeTouchDown() {
    assertEquals(1079, TouchTrack.coordinate(1, 1080), 0);
    assertEquals(0, TouchTrack.coordinate(0, 1080), 0);
    assertThrows(IllegalArgumentException.class, () -> TouchTrack.coordinate(Double.NaN, 1080));
    assertThrows(IllegalArgumentException.class, () -> TouchTrack.coordinate(1.01, 1080));
    assertThrows(IllegalArgumentException.class, () -> new TouchTrack(new float[]{0, 0, 1, 1}, 2001, 100, 0));
    assertThrows(IllegalArgumentException.class, () -> new TouchTrack(new float[]{0, 0, 1, 1}, 0, 0, 0));
    assertThrows(IllegalArgumentException.class, () -> new TouchTrack(new float[]{0, 0, Float.NaN, 1}, 0, 100, 0));
  }
}
