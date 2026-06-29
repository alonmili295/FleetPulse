import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  // ── Basic storage ─────────────────────────────────────────────────────────────

  it('returns entries in oldest-first insertion order when not full', () => {
    const buf = new RingBuffer<number>(4);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  it('evicts the oldest entry when full and preserves insertion order', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // evicts 1
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  it('evicts the correct oldest entry across multiple overflows', () => {
    const buf = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach(n => buf.push(n));
    expect(buf.toArray()).toEqual([3, 4, 5]);
  });

  it('returns an empty array when no items have been pushed', () => {
    const buf = new RingBuffer<number>(5);
    expect(buf.toArray()).toEqual([]);
  });

  // ── size / isFull ─────────────────────────────────────────────────────────────

  it('reports size correctly as items are added', () => {
    const buf = new RingBuffer<string>(5);
    expect(buf.size).toBe(0);
    buf.push('a');
    buf.push('b');
    expect(buf.size).toBe(2);
  });

  it('caps size at capacity once the buffer overflows', () => {
    const buf = new RingBuffer<number>(3);
    for (let i = 0; i < 10; i++) buf.push(i);
    expect(buf.size).toBe(3);
  });

  it('isFull is false until capacity is reached, then true', () => {
    const buf = new RingBuffer<number>(2);
    expect(buf.isFull).toBe(false);
    buf.push(1);
    expect(buf.isFull).toBe(false);
    buf.push(2);
    expect(buf.isFull).toBe(true);
  });

  // ── latest() ─────────────────────────────────────────────────────────────────

  it('latest() returns undefined when empty', () => {
    const buf = new RingBuffer<number>(3);
    expect(buf.latest()).toBeUndefined();
  });

  it('latest() returns the most recently pushed item', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(10);
    buf.push(20);
    expect(buf.latest()).toBe(20);
  });

  it('latest() returns the newest item even after overflow', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(99); // evicts 1, newest is 99
    expect(buf.latest()).toBe(99);
  });

  // ── clear() ──────────────────────────────────────────────────────────────────

  it('clear() resets size to 0 and toArray() returns []', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it('clear() allows new items to be pushed after reset', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.clear();
    buf.push(7);
    buf.push(8);
    expect(buf.toArray()).toEqual([7, 8]);
    expect(buf.latest()).toBe(8);
  });

  it('clear() resets isFull to false', () => {
    const buf = new RingBuffer<number>(2);
    buf.push(1);
    buf.push(2);
    expect(buf.isFull).toBe(true);
    buf.clear();
    expect(buf.isFull).toBe(false);
  });

  // ── Guard ─────────────────────────────────────────────────────────────────────

  it('throws RangeError for capacity less than 1', () => {
    expect(() => new RingBuffer<number>(0)).toThrow(RangeError);
  });
});
