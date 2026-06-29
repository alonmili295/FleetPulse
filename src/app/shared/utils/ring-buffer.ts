// shared/utils — bounded FIFO ring buffer, pure TS, zero Angular deps; used by P1 (LogService), P2 (TelemetryStore history), P7 (AlertStore). No side-effects or I/O.

/** Fixed-capacity ring buffer that evicts the oldest entry when full. */
export class RingBuffer<T> {
  private readonly buf: Array<T | undefined>;
  private head = 0;   // next write slot; wraps around, pointing to oldest entry when full
  private _size = 0;

  constructor(readonly capacity: number) {
    if (capacity < 1) throw new RangeError('RingBuffer capacity must be ≥ 1');
    this.buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  get size(): number {
    return this._size;
  }

  get isFull(): boolean {
    return this._size === this.capacity;
  }

  /** Returns all entries in insertion order (oldest first). */
  toArray(): T[] {
    if (this._size === 0) return [];
    if (this._size < this.capacity) {
      return this.buf.slice(0, this._size) as T[];
    }
    // Full: head points to the oldest slot (it will be overwritten on the next push).
    const tail = this.buf.slice(this.head) as T[];
    const front = this.buf.slice(0, this.head) as T[];
    return [...tail, ...front];
  }

  /** Returns the most recently pushed item, or undefined when empty. */
  latest(): T | undefined {
    if (this._size === 0) return undefined;
    const latestIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buf[latestIndex];
  }

  /** Empties the buffer and resets head and size. */
  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this._size = 0;
  }
}
