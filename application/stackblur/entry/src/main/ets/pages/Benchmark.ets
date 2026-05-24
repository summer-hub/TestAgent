/*
 * Copyright (C) 2026 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Benchmark Page — StackBlur 性能对比页面
 *
 * 对应 Android StackBlurDemo 中的 BenchmarkActivity：
 *  - 拖动滑块选择模糊半径后，异步串行跑 ArkTS 和 Native C 两种实现
 *  - 用进度条 + 毫秒数实时展示各实现耗时
 *  - 将两种实现的模糊结果左右拼接展示在同一图中（三等分：ArkTS | Native | 原图）
 *
 * 注：原 Android 版本有 RenderScript 一栏，HarmonyOS 不支持，已省略。
 */

import { hilog } from '@kit.PerformanceAnalysisKit';
import { image } from '@kit.ImageKit';
import { StackBlurManager } from '@ohos/stackblur';

const DOMAIN = 0x0000;

/** 一次 benchmark 的结果 */
interface BenchmarkResult {
  label: string;
  elapsedMs: number;
}

/** 进度条状态 */
interface ProgressState {
  indeterminate: boolean;
  value: number;
  max: number;
  detailText: string;
}

@Entry
@Component
struct Benchmark {
  // 原始 PixelMap（从 media 资源加载）
  @State originalPixelMap: image.PixelMap | null = null;
  // 拼接后的对比结果图
  @State resultPixelMap: image.PixelMap | null = null;
  // 模糊半径
  @State radius: number = 10;
  // 是否正在跑 benchmark
  @State isRunning: boolean = false;
  // ArkTS 实现进度
  @State arktsProgress: ProgressState = {
    indeterminate: false,
    value: 0,
    max: 100,
    detailText: '–'
  };
  // Native 实现进度
  @State nativeProgress: ProgressState = {
    indeterminate: false,
    value: 0,
    max: 100,
    detailText: '–'
  };
  @State statusText: string = '拖动滑块开始性能测试';

  aboutToAppear(): void {
    try {
      const bytes: Uint8Array = getContext(this).resourceManager
        .getMediaContentSync($r('app.media.image_transparency').id);
      const decodeOpts: image.DecodingOptions = {
        editable: true,
        desiredPixelFormat: image.PixelMapFormat.RGBA_8888
      };
      image.createImageSource(bytes.buffer as ArrayBuffer)
        .createPixelMap(decodeOpts)
        .then((pm: image.PixelMap) => {
          this.originalPixelMap = pm;
        })
        .catch((err: Error) => {
          hilog.error(DOMAIN, 'Benchmark', 'load image failed: %{public}s', err.message);
        });
    } catch (err) {
      hilog.error(DOMAIN, 'Benchmark', 'getMediaContent failed: %{public}s', (err as Error).message);
    }
  }

  /**
   * 串行跑两种实现，逐步更新进度条，最后合并结果图。
   * 对应 Android BenchmarkTask（AsyncTask）。
   */
  private async runBenchmark(): Promise<void> {
    if (this.isRunning || this.originalPixelMap === null) {
      return;
    }
    this.isRunning = true;
    this.resultPixelMap = null;
    this.statusText = '正在测试…';

    // 重置进度条
    this.arktsProgress = {
      indeterminate: true,
      value: 0,
      max: 100,
      detailText: '测试中…'
    };
    this.nativeProgress = {
      indeterminate: true,
      value: 0,
      max: 100,
      detailText: '待测试'
    };

    const info: image.ImageInfo = this.originalPixelMap.getImageInfoSync();
    const w: number = info.size.width;
    const h: number = info.size.height;
    const results: BenchmarkResult[] = [];

    try {
      const manager: StackBlurManager = new StackBlurManager(this.originalPixelMap);

      // ── ArkTS 实现 ────────────────────────────────────────────────────────
      const t0: number = Date.now();
      const arktsBlurred: image.PixelMap = manager.process(this.radius);
      const arktsMs: number = Date.now() - t0;
      results.push({ label: 'ArkTS', elapsedMs: arktsMs });
      const maxMs0: number = arktsMs;
      this.arktsProgress = {
        indeterminate: false,
        value: arktsMs,
        max: maxMs0,
        detailText: `${arktsMs} ms`
      };
      hilog.info(DOMAIN, 'Benchmark', 'ArkTS blur done in %{public}d ms', arktsMs);

      // ── Native C 实现 ─────────────────────────────────────────────────────
      this.nativeProgress = {
        indeterminate: true,
        value: 0,
        max: maxMs0,
        detailText: '测试中…'
      };
      const t1: number = Date.now();
      const nativeBlurred: image.PixelMap = manager.processNatively(this.radius);
      const nativeMs: number = Date.now() - t1;
      results.push({ label: 'Native C', elapsedMs: nativeMs });

      const maxMs: number = Math.max(arktsMs, nativeMs);
      this.arktsProgress = {
        indeterminate: false,
        value: arktsMs,
        max: maxMs,
        detailText: `${arktsMs} ms`
      };
      this.nativeProgress = {
        indeterminate: false,
        value: nativeMs,
        max: maxMs,
        detailText: `${nativeMs} ms`
      };
      hilog.info(DOMAIN, 'Benchmark', 'Native blur done in %{public}d ms', nativeMs);

      // ── 拼接三等分对比图（ArkTS | Native | 原图）──────────────────────────
      this.resultPixelMap = this.compositeThreeParts(arktsBlurred, nativeBlurred, w, h);

      this.statusText =
        `ArkTS: ${arktsMs} ms  |  Native: ${nativeMs} ms  |  加速比: ${(arktsMs / nativeMs).toFixed(1)}×`;
    } catch (err) {
      const e = err as Error;
      this.statusText = `错误: ${e.message}`;
      hilog.error(DOMAIN, 'Benchmark', 'benchmark error: %{public}s', e.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 将 left、right 两张模糊图与原图水平三等分拼接成一张结果图。
   * 对应 BenchmarkActivity 中的 Canvas 拼接逻辑。
   *
   * 输出图像布局：
   *   [0 .. w/3)        → ArkTS 模糊左侧 1/3
   *   [w/3 .. 2w/3)     → Native 模糊中间 1/3
   *   [2w/3 .. w)       → 原图右侧 1/3
   */
  private compositeThreeParts(
    arktsBlurred: image.PixelMap,
    nativeBlurred: image.PixelMap,
    w: number,
    h: number
  ): image.PixelMap {
    const bufSize: number = w * h * 4;
    const out: Uint8Array = new Uint8Array(bufSize);

    // 读取三张图的像素
    const arktsBuf: ArrayBuffer = new ArrayBuffer(bufSize);
    const nativeBuf: ArrayBuffer = new ArrayBuffer(bufSize);
    const origBuf: ArrayBuffer = new ArrayBuffer(bufSize);

    arktsBlurred.readPixelsToBufferSync(arktsBuf);
    nativeBlurred.readPixelsToBufferSync(nativeBuf);
    (this.originalPixelMap as image.PixelMap).readPixelsToBufferSync(origBuf);

    const arktsArr: Uint8Array = new Uint8Array(arktsBuf);
    const nativeArr: Uint8Array = new Uint8Array(nativeBuf);
    const origArr: Uint8Array = new Uint8Array(origBuf);

    const third: number = Math.floor(w / 3);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dstOff: number = (y * w + x) * 4;
        let srcArr: Uint8Array;
        if (x < third) {
          srcArr = arktsArr; // 左 1/3：ArkTS
        } else if (x < third * 2) {
          srcArr = nativeArr; // 中 1/3：Native
        } else {
          srcArr = origArr; // 右 1/3：原图
        }
        out[dstOff] = srcArr[dstOff];
        out[dstOff + 1] = srcArr[dstOff + 1];
        out[dstOff + 2] = srcArr[dstOff + 2];
        out[dstOff + 3] = srcArr[dstOff + 3];
      }
    }

    const outBuf: ArrayBuffer = out.buffer as ArrayBuffer;
    const opts: image.InitializationOptions = {
      alphaType: image.AlphaType.UNPREMUL,
      editable: false,
      pixelFormat: image.PixelMapFormat.RGBA_8888,
      size: { width: w, height: h }
    };
    return image.createPixelMapSync(outBuf, opts);
  }

  build() {
    Scroll() {
      Column({ space: 14 }) {

        // ── 标题 ─────────────────────────────────────────────────────────────
        Text('性能对比 (Benchmark)')
          .fontSize(20)
          .fontWeight(FontWeight.Bold)
          .width('100%')
          .textAlign(TextAlign.Center)

        // ── 对比结果图 ───────────────────────────────────────────────────────
        Text('左: ArkTS  中: Native C  右: 原图')
          .fontSize(12)
          .fontColor(Color.Gray)
          .width('100%')
          .textAlign(TextAlign.Center)

        if (this.resultPixelMap !== null) {
          Image(this.resultPixelMap as image.PixelMap)
            .width('100%')
            .aspectRatio(1.6)
            .objectFit(ImageFit.Contain)
            .backgroundColor('#F0F0F0')
            .border({ width: 1, color: '#0A59F7' })
        } else {
          Row() {
            Text('拖动下方滑块开始测试')
              .fontSize(13)
              .fontColor(Color.Gray)
          }
          .width('100%')
          .height(160)
          .justifyContent(FlexAlign.Center)
          .backgroundColor('#F5F5F5')
          .border({ width: 1, color: Color.Gray })
        }

        // ── ArkTS 进度条 ─────────────────────────────────────────────────────
        Column({ space: 4 }) {
          Row() {
            Text('ArkTS').fontSize(13).width(70)
            Text(this.arktsProgress.detailText).fontSize(13).fontColor('#0A59F7')
          }
          .width('100%')
          .justifyContent(FlexAlign.SpaceBetween)

          Progress({
            value: this.arktsProgress.indeterminate ? 0 : this.arktsProgress.value,
            total: this.arktsProgress.max,
            type: ProgressType.Linear
          })
            .width('100%')
            .color('#0A59F7')
        }
        .width('100%')

        // ── Native C 进度条 ──────────────────────────────────────────────────
        Column({ space: 4 }) {
          Row() {
            Text('Native C').fontSize(13).width(70)
            Text(this.nativeProgress.detailText).fontSize(13).fontColor('#28A745')
          }
          .width('100%')
          .justifyContent(FlexAlign.SpaceBetween)

          Progress({
            value: this.nativeProgress.indeterminate ? 0 : this.nativeProgress.value,
            total: this.nativeProgress.max,
            type: ProgressType.Linear
          })
            .width('100%')
            .color('#28A745')
        }
        .width('100%')

        // ── 半径滑块 ─────────────────────────────────────────────────────────
        Row({ space: 8 }) {
          Text(`半径: ${this.radius} px`).fontSize(14).width(90)
          Slider({
            value: this.radius,
            min: 1,
            max: 50,
            step: 1,
            style: SliderStyle.OutSet
          })
            .layoutWeight(1)
            .onChange((value: number) => {
              this.radius = Math.floor(value);
              this.runBenchmark();
            })
        }
        .width('100%')

        // ── 状态文字 ─────────────────────────────────────────────────────────
        Text(this.statusText)
          .fontSize(12)
          .fontColor(this.isRunning ? Color.Orange : Color.Gray)
          .width('100%')
          .textAlign(TextAlign.Center)

      }
      .width('100%')
      .padding({
        top: 20,
        bottom: 24,
        left: 16,
        right: 16
      })
    }
    .width('100%')
    .height('100%')
  }
}
