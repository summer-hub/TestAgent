/**
 * PointerMatrix — 多点触控手势数据矩阵
 *
 * 对标 Python hypium 的 PointerMatrix (part of hypium/model/gesture.py)。
 * 定义手指、触点序列和手势参数，为未来 RPC 多指注入做准备。
 *
 * 当前通过 shell uitest 单指模拟，数据结构保留供 RPC 通道使用。
 *
 * 用法:
 * ```typescript
 * // 双指捏合
 * const matrix = new PointerMatrix()
 *   .addFinger([
 *     { x: 100, y: 100 },
 *     { x: 200, y: 200 },
 *   ])
 *   .addFinger([
 *     { x: 400, y: 400 },
 *     { x: 300, y: 300 },
 *   ])
 *   .speed(3000);
 * ```
 */

/** 单指在单步中的触点 */
export interface FingerPoint {
  x: number;
  y: number;
  /** 可选：该点的延迟时间 (ms) */
  delay?: number;
}

/** 单指轨迹：一系列触点 */
export type FingerTrace = FingerPoint[];

/**
 * PointerMatrix — 多指手势矩阵
 *
 * 描述 N 个手指的完整运动轨迹。
 * fingerCount = 轨迹数, traceLength = 每指轨迹长度。
 */
export class PointerMatrix {
  /** 多指轨迹 (每指一系列触点) */
  private traces: FingerTrace[] = [];
  /** 手势速度 (像素/秒) */
  private _speed: number = 6000;

  /** 手指数量 */
  get fingerCount(): number {
    return this.traces.length;
  }

  /** 轨迹长度 (每指步数) */
  get traceLength(): number {
    return this.traces.length > 0 ? this.traces[0].length : 0;
  }

  /** 当前速度值 (像素/秒) */
  get speed(): number {
    return this._speed;
  }

  /** 添加一手指轨迹 */
  addFinger(trace: FingerTrace): this {
    if (this.traces.length > 0 && trace.length !== this.traces[0].length) {
      throw new GestureError(`All finger traces must have same length (expected ${this.traces[0].length}, got ${trace.length})`);
    }
    this.traces.push([...trace]);
    return this;
  }

  /** 设置手势速度 */
  setSpeed(val: number): this {
    this._speed = val;
    return this;
  }

  /** 获取所有轨迹 */
  getTraces(): readonly FingerTrace[] {
    return this.traces.map(t => [...t]);
  }

  /** 转为 Python hypium 兼容格式 (供 RPC) */
  toHypiumFormat(): any[] {
    return this.traces.map(trace =>
      trace.map(p => ({ x: p.x, y: p.y }))
    );
  }

  /** 步数 */
  get totalSteps(): number {
    return this.traces.length > 0 ? this.traces[0].length : 0;
  }

  /**
   * 简化为单指模拟 (所有手指求平均，用于 shell uitest 降级)
   */
  toSingleFinger(): FingerTrace {
    if (this.traces.length === 0) return [];
    if (this.traces.length === 1) return [...this.traces[0]];

    const steps = this.traces[0].length;
    const average: FingerPoint[] = [];
    for (let step = 0; step < steps; step++) {
      let sumX = 0, sumY = 0;
      for (const trace of this.traces) {
        sumX += trace[step].x;
        sumY += trace[step].y;
      }
      average.push({
        x: Math.floor(sumX / this.traces.length),
        y: Math.floor(sumY / this.traces.length),
      });
    }
    return average;
  }
}

/** 手势构造错误 */
export class GestureError extends Error {
  constructor(message: string) {
    super(`[Gesture] ${message}`);
    this.name = 'GestureError';
  }
}

/**
 * 创建双指捏合/放大的 PointerMatrix
 */
export function createPinchMatrix(
  centerX: number, centerY: number,
  startRadius: number, endRadius: number,
  steps: number = 10
): PointerMatrix {
  const finger1: FingerPoint[] = [];
  const finger2: FingerPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const r = startRadius + (endRadius - startRadius) * progress;
    // 手指1: 向右
    finger1.push({ x: Math.floor(centerX + r), y: centerY });
    // 手指2: 向左
    finger2.push({ x: Math.floor(centerX - r), y: centerY });
  }

  return new PointerMatrix()
    .addFinger(finger1)
    .addFinger(finger2);
}

/**
 * 创建旋转手势的 PointerMatrix
 */
export function createRotateMatrix(
  centerX: number, centerY: number,
  startAngle: number, endAngle: number,
  radius: number,
  steps: number = 16
): PointerMatrix {
  const finger1: FingerPoint[] = [];
  const finger2: FingerPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = angle * Math.PI / 180;
    // 手指1: 顺时针
    finger1.push({
      x: Math.floor(centerX + radius * Math.cos(rad)),
      y: Math.floor(centerY + radius * Math.sin(rad)),
    });
    // 手指2: 逆时针 (对面)
    finger2.push({
      x: Math.floor(centerX + radius * Math.cos(rad + Math.PI)),
      y: Math.floor(centerY + radius * Math.sin(rad + Math.PI)),
    });
  }

  return new PointerMatrix()
    .addFinger(finger1)
    .addFinger(finger2);
}
