import { describe, it, expect } from "vitest";
import { RingBuffer } from "./ring-buffer.js";

describe("RingBuffer", () => {
  it("push and getRelative with small data", () => {
    const rb = new RingBuffer<number>(5);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.length).toBe(3);
    expect(rb.getRelative(0)).toBe(3);
    expect(rb.getRelative(-1)).toBe(2);
    expect(rb.getRelative(-2)).toBe(1);
    expect(rb.getRelative(1)).toBe(2); // 正值对称
  });

  it("wraps around when full", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.length).toBe(3);
    rb.push(4); // 覆盖 1
    expect(rb.length).toBe(3);
    expect(rb.getRelative(0)).toBe(4);
    expect(rb.getRelative(-1)).toBe(3);
    expect(rb.getRelative(-2)).toBe(2);
  });

  it("toArray returns from oldest to newest", () => {
    const rb = new RingBuffer<number>(4);
    for (let i = 1; i <= 6; i++) rb.push(i);
    expect(rb.toArray()).toEqual([3, 4, 5, 6]);
    expect(rb.length).toBe(4);
  });

  it("toArray when not full", () => {
    const rb = new RingBuffer<number>(5);
    rb.push(10);
    rb.push(20);
    expect(rb.toArray()).toEqual([10, 20]);
  });

  it("throws when reading out of bounds", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    expect(() => rb.getRelative(-2)).toThrow(/超出环形缓冲范围/);
  });

  it("throws for zero capacity", () => {
    expect(() => new RingBuffer(0)).toThrow(/容量必须大于 0/);
  });

  it("works with object elements", () => {
    const rb = new RingBuffer<{ id: number }>(2);
    const a = { id: 1 };
    const b = { id: 2 };
    const c = { id: 3 };
    rb.push(a);
    rb.push(b);
    rb.push(c);
    expect(rb.getRelative(0)).toBe(c);
    expect(rb.getRelative(-1)).toBe(b);
    expect(rb.toArray()).toEqual([b, c]);
  });
});
