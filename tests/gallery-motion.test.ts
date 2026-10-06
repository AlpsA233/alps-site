import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGalleryInertia,
  advanceGallerySnap,
  clampGalleryPosition,
  nearestGalleryStop,
} from "../src/components/gallery-motion";

test("a finite gallery cannot coast outside either content edge", () => {
  for (const velocity of [-2600, 2600]) {
    let state = { position: 500, velocity };
    let previousSpeed = Math.abs(velocity);
    for (let frame = 0; frame < 240; frame++) {
      state = advanceGalleryInertia(state, 1 / 60, 1000);
      assert.ok(state.position >= 0 && state.position <= 1000);
      assert.ok(Math.abs(state.velocity) <= previousSpeed);
      previousSpeed = Math.abs(state.velocity);
    }
    assert.ok(Math.abs(state.position - (500 + velocity / 6.2)) < 0.000001);
  }
  assert.deepEqual(
    advanceGalleryInertia({ position: 990, velocity: 2600 }, 0.1, 1000),
    { position: 1000, velocity: 0 },
  );
  assert.deepEqual(
    advanceGalleryInertia({ position: 10, velocity: -2600 }, 0.1, 1000),
    { position: 0, velocity: 0 },
  );
});

test("coasting and centering have the same result on 30, 60 and 120 Hz displays", () => {
  function simulate(hertz: number) {
    let state = { position: 380, velocity: 1600 };
    for (let frame = 0; frame < hertz / 2; frame++)
      state = advanceGalleryInertia(state, 1 / hertz, 2000);
    for (let frame = 0; frame < hertz; frame++)
      state = advanceGallerySnap(state, 1000, 1 / hertz, 2000);
    return state;
  }
  const reference = simulate(60);
  for (const hertz of [30, 120]) {
    const result = simulate(hertz);
    assert.ok(Math.abs(result.position - reference.position) < 0.000001);
    assert.ok(Math.abs(result.velocity - reference.velocity) < 0.000001);
  }
});

test("centering converges within bounds even after a fast edgeward release", () => {
  for (const initialPosition of [0, 300, 999, 1000]) {
    for (const velocity of [-2600, 0, 2600]) {
      for (const target of [0, 500, 1000]) {
        let state = { position: initialPosition, velocity };
        for (let frame = 0; frame < 240; frame++) {
          state = advanceGallerySnap(state, target, 1 / 60, 1000);
          assert.ok(Number.isFinite(state.velocity));
          assert.ok(state.position >= 0 && state.position <= 1000);
        }
        assert.ok(Math.abs(state.position - target) < 0.001);
        assert.ok(Math.abs(state.velocity) < 0.01);
      }
    }
  }
});

test("single-item and empty galleries remain valid, and stop selection uses real centers", () => {
  assert.equal(clampGalleryPosition(150, 0), 0);
  assert.equal(clampGalleryPosition(150, -50), 0);
  assert.equal(nearestGalleryStop(150, []), 0);
  assert.equal(nearestGalleryStop(150, [0]), 0);
  assert.equal(nearestGalleryStop(1250, [0, 740, 1480]), 1480);
  assert.equal(nearestGalleryStop(600, [0, 740, 1480]), 740);
  assert.deepEqual(
    advanceGallerySnap({ position: 0, velocity: 2600 }, 1000, 1 / 60, 0),
    { position: 0, velocity: 0 },
  );
});
