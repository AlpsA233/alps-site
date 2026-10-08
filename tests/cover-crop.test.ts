import assert from "node:assert/strict";
import test from "node:test";
import {
  getCropGeometry,
  getCropOutputSize,
  moveCropCenter,
  type CropGeometry,
} from "../src/lib/image-crop";

function assertCovered(geometry: CropGeometry) {
  const epsilon = 1e-8;
  assert.ok(geometry.rendered.x <= epsilon);
  assert.ok(geometry.rendered.y <= epsilon);
  assert.ok(
    geometry.rendered.x + geometry.rendered.width >=
      geometry.viewport.width - epsilon,
  );
  assert.ok(
    geometry.rendered.y + geometry.rendered.height >=
      geometry.viewport.height - epsilon,
  );
  assert.ok(geometry.source.x >= -epsilon);
  assert.ok(geometry.source.y >= -epsilon);
  assert.ok(
    geometry.source.x + geometry.source.width <= geometry.image.width + epsilon,
  );
  assert.ok(
    geometry.source.y + geometry.source.height <=
      geometry.image.height + epsilon,
  );
}

test("each cover ratio exports exact proportions without enlarging the source", () => {
  for (const aspect of [
    { width: 3, height: 2 },
    { width: 16, height: 9 },
    { width: 1, height: 1 },
    { width: 4, height: 5 },
  ]) {
    for (const image of [
      { width: 6000, height: 4000 },
      { width: 317, height: 509 },
    ]) {
      const viewport = {
        width: 600,
        height: (600 * aspect.height) / aspect.width,
      };
      const geometry = getCropGeometry(image, viewport);
      const output = getCropOutputSize(geometry.source, aspect);
      assertCovered(geometry);
      assert.equal(output.width * aspect.height, output.height * aspect.width);
      assert.ok(output.width <= geometry.source.width + 1e-8);
      assert.ok(output.height <= geometry.source.height + 1e-8);
      assert.ok(Math.max(output.width, output.height) <= 1800);
    }
  }
});

test("edgeward dragging clamps both axes and keeps the entire crop inside the image", () => {
  const initial = getCropGeometry(
    { width: 2400, height: 1600 },
    { width: 600, height: 400 },
    2,
  );
  for (const delta of [
    { x: 100000, y: 100000 },
    { x: -100000, y: -100000 },
    { x: 100000, y: -100000 },
    { x: -100000, y: 100000 },
  ]) {
    const center = moveCropCenter(initial, delta);
    const geometry = getCropGeometry(
      initial.image,
      initial.viewport,
      2,
      center,
    );
    assertCovered(geometry);
    assert.equal(
      center.x,
      delta.x > 0 ? geometry.minCenter.x : geometry.maxCenter.x,
    );
    assert.equal(
      center.y,
      delta.y > 0 ? geometry.minCenter.y : geometry.maxCenter.y,
    );
  }
});

test("zooming out and changing the preview ratio never exposes blank edges", () => {
  for (const image of [
    { width: 8000, height: 500 },
    { width: 500, height: 8000 },
    { width: 1200, height: 1200 },
  ]) {
    let center = { x: 1, y: 0 };
    for (const viewport of [
      { width: 640, height: 360 },
      { width: 320, height: 400 },
      { width: 240, height: 160 },
    ]) {
      for (const zoom of [4, 2.73, 1.21, 1]) {
        const geometry = getCropGeometry(image, viewport, zoom, center);
        center = geometry.center;
        assertCovered(geometry);
      }
    }
  }
});

test("the same crop center and source region survive a proportional viewport resize", () => {
  const image = { width: 3000, height: 2000 };
  const center = { x: 0.72, y: 0.3 };
  const large = getCropGeometry(
    image,
    { width: 600, height: 400 },
    2.5,
    center,
  );
  const small = getCropGeometry(
    image,
    { width: 300, height: 200 },
    2.5,
    center,
  );
  assert.deepEqual(small.source, large.source);
  assert.deepEqual(small.center, large.center);
  assertCovered(small);
});

test("invalid geometry fails explicitly and tiny output cannot violate the no-upscale rule", () => {
  assert.throws(() =>
    getCropGeometry({ width: 0, height: 1 }, { width: 1, height: 1 }),
  );
  assert.throws(() =>
    getCropOutputSize({ width: 1, height: 1 }, { width: 3, height: 2 }),
  );
  assert.deepEqual(
    getCropOutputSize({ width: 1, height: 1 }, { width: 1, height: 1 }),
    { width: 1, height: 1 },
  );
  const geometry = getCropGeometry(
    { width: 1200, height: 800 },
    { width: 600, height: 400 },
    Number.NaN,
    { x: Number.POSITIVE_INFINITY, y: Number.NaN },
  );
  assert.equal(geometry.zoom, 1);
  assert.deepEqual(geometry.center, { x: 0.5, y: 0.5 });
  assertCovered(geometry);
});
