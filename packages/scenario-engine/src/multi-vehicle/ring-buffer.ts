/**
 * 固定容量环形缓冲。
 *
 * 用于替换仿真中的完整 history 数组。只保留最近 N 个快照，
 * 满足"感知延迟读取历史状态"的需求（最大反应时间 / dt + 1 步）。
 *
 * push 时如果容量已满，最旧的元素被覆盖。
 * getRelative(0) 返回最新元素，getRelative(-1) 返回前一步，依此类推。
 */
export class RingBuffer<T> {
  private readonly buffer: T[];
  private head = 0; // 下一个写入位置
  private count = 0;

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error("RingBuffer 容量必须大于 0");
    this.buffer = new Array(capacity);
  }

  push(value: T): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * 按相对偏移读取。
   *
   * @param offset 0 = 最新（最后 push 的元素），-1 = 前一步，-2 = 前两步，依此类推。
   *               正值表示向更早方向读取（与负值对称，方便调用）。
   */
  getRelative(offset: number): T {
    const abs = Math.abs(offset);
    if (abs >= this.count) throw new Error("读取位置超出环形缓冲范围");
    const index =
      (this.head - 1 - abs + this.capacity) % this.capacity;
    return this.buffer[index]!;
  }

  get length(): number {
    return this.count;
  }

  /** 返回所有元素（从最旧到最新）。用于需要完整序列的场景。 */
  toArray(): T[] {
    const result: T[] = [];
    const start =
      this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]!);
    }
    return result;
  }
}
