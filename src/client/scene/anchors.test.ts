import { afterEach, describe, expect, it } from 'vitest';
import { anchorsMoved, ndcToPixels, seatScreenAnchor, useSeatAnchors } from './anchors';

describe('ndcToPixels', () => {
  it('maps the centre and corners of the screen', () => {
    expect(ndcToPixels({ x: 0, y: 0, z: 0 }, 1440, 900)).toEqual({ x: 720, y: 450, visible: true });
    expect(ndcToPixels({ x: -1, y: 1, z: 0 }, 1440, 900)).toMatchObject({ x: 0, y: 0 });
  });

  it('hides points behind the camera or off screen', () => {
    expect(ndcToPixels({ x: 0, y: 0, z: 1.2 }, 100, 100).visible).toBe(false);
    expect(ndcToPixels({ x: 1.5, y: 0, z: 0 }, 100, 100).visible).toBe(false);
  });
});

describe('anchorsMoved', () => {
  const a = { s0: { x: 10, y: 10, pageX: 10, pageY: 10, visible: true } };
  it('ignores sub-pixel jitter and notices real moves', () => {
    expect(anchorsMoved(a, { s0: { ...a.s0, x: 10.3 } })).toBe(false);
    expect(anchorsMoved(a, { s0: { ...a.s0, y: 14 } })).toBe(true);
    expect(anchorsMoved(a, {})).toBe(true);
    expect(anchorsMoved(a, { s0: { ...a.s0, visible: false } })).toBe(true);
  });
});

describe('seatScreenAnchor', () => {
  afterEach(() => useSeatAnchors.setState({ seats: {}, width: 0, height: 0 }));
  it('reads the latest anchors from the store', () => {
    expect(seatScreenAnchor('s1')).toBeNull();
    useSeatAnchors.setState({ seats: { s1: { x: 1, y: 2, pageX: 3, pageY: 4, visible: true } }, width: 10, height: 10 });
    expect(seatScreenAnchor('s1')?.pageY).toBe(4);
  });
});
