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
 * Demo 002: Native C High-Performance Blur Comparison
 *
 * 功能说明：展示 StackBlurManager 的两种 Native C 高性能模糊方式（processNatively() 和
 *           processRenderScript()），通过对同一图像分别执行三种模糊并记录耗时，直观对比
 *           Native C 实现相比纯 ArkTS 的性能优势，同时验证 processRenderScript() 在
 *           鸿蒙上等价于 processNatively() 的行为。
 *
 * 对应接口：
 *   new StackBlurManager(pixelMap: image.PixelMap)
 *   processNatively(radius: number): image.PixelMap
 *   processRenderScript(context: common.Context, radius: number): image.PixelMap
 */

import { hilog } from '@kit.PerformanceAnalysisKit';
import { image } from '@kit.ImageKit';
import { common } from '@kit.AbilityKit';
import { StackBlurManager } from '@ohos/stackblur';

// ─── 日志常量 ──────────────────────────────────────────────────────────────────
const DOMAIN: number = 0x0000;
const TAG: string = 'StackBlur_002NativeBlur';

// TimingResult 接口已拆分为独立 @State 原始类型变量，确保 ArkUI 响应式观测

@Entry
@Component
struct NativeBlurComparePage {
  // ─── 状态变量（@State 响应式）──────────────────────────────────────────────────
  /** 图片展示区当前显示的 PixelMap */
  @State private displayPixelMap: image.PixelMap | null = null;
  /** ArkTS 模糊耗时（ms）及完成标志 */
  @State private arktsDone: boolean = false;
  @State private arktsMs: number = 0;
  /** Native C 模糊耗时（ms）及完成标志 */
  @State private nativeDone: boolean = false;
  @State private nativeMs: number = 0;
  /** RenderScript 兼容模糊耗时（ms）及完成标志 */
  @State private rsDone: boolean = false;
  @State private rsMs: number = 0;
  /** 接口调用状态文本 */
  @State private statusText: string = '';
  /** 模糊半径（1–254，步长 1） */
  @State private radius: number = 25;
  /** 是否已加载图片（控制各模糊按钮可用状态） */
  @State private isLoaded: boolean = false;
  // ─── 非响应式成员 ──────────────────────────────────────────────────────────────
  /** 原始图像字节，用于每次模糊前重新解码为干净的 PixelMap */
  private imageBytes: ArrayBuffer | null = null;

  // ─── 生命周期 ──────────────────────────────────────────────────────────────────

  aboutToAppear(): void {
    hilog.info(DOMAIN, TAG, 'Demo 002 page appeared');
    this.loadTestImage();
  }

  aboutToDisappear(): void {
    hilog.info(DOMAIN, TAG, 'Demo 002 page disappeared');
    this.imageBytes = null;
    this.displayPixelMap = null;
  }

  // ─── 核心功能方法 ──────────────────────────────────────────────────────────────

  /**
   * 从内置资源加载测试图片字节，并预展示原图。
   */
  private loadTestImage(): void {
    hilog.debug(DOMAIN, TAG, 'loadTestImage called');
    try {
      const bytes: Uint8Array = getContext(this).resourceManager
        .getMediaContentSync($r('app.media.android_platform_256').id);
      this.imageBytes = bytes.buffer as ArrayBuffer;
      image.createImageSource(this.imageBytes)
        .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 })
        .then((pm: image.PixelMap) => {
          this.displayPixelMap = pm;
          this.isLoaded = true;
          hilog.info(DOMAIN, TAG, 'Test image loaded');
          this.statusText = '图片已加载，可开始模糊对比测试';
        })
        .catch((err: Error) => {
          hilog.error(DOMAIN, TAG, 'createPixelMap failed: %{public}s', err.message);
          this.statusText = '图片加载失败：' + err.message;
        });
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'loadTestImage failed: %{public}s', msg);
      this.statusText = '加载失败：' + msg;
    }
  }

  /**
   * 从原始字节解码出一张干净的 PixelMap（editable=true）用于模糊操作。
   * 每次模糊前调用，确保从相同的未修改图像开始。
   */
  private decodeFreshPixelMap(): Promise<image.PixelMap> {
    hilog.debug(DOMAIN, TAG, 'decodeFreshPixelMap called');
    return image.createImageSource(this.imageBytes as ArrayBuffer)
      .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 });
  }

  /**
   * 使用纯 ArkTS 实现（process()）执行模糊并记录耗时，用于性能基准对比。
   */
  private async runArkTsBlur(): Promise<void> {
    hilog.debug(DOMAIN, TAG, 'runArkTsBlur called, radius=%{public}d', this.radius);
    if (this.imageBytes === null) {
      return;
    }
    this.arktsDone = false;
    this.arktsMs = 0;
    try {
      const pm: image.PixelMap = await this.decodeFreshPixelMap();
      const manager: StackBlurManager = new StackBlurManager(pm);
      const t0: number = Date.now();
      const blurred: image.PixelMap = manager.process(this.radius);
      const elapsed: number = Date.now() - t0;
      this.arktsMs = elapsed;
      this.arktsDone = true;
      this.displayPixelMap = blurred;
      hilog.info(DOMAIN, TAG, 'process(%{public}d) done in %{public}d ms', this.radius, elapsed);
      this.statusText = 'process() 完成，耗时 ' + elapsed.toString() + ' ms';
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'runArkTsBlur failed: %{public}s', msg);
      this.statusText = 'ArkTS 模糊失败：' + msg;
    }
  }

  /**
   * 使用 Native C 实现（processNatively()）执行模糊并记录耗时。
   *
   * ✅ 验证点 1: processNatively(radius) 正常返回模糊 PixelMap，结果展示区有明显模糊效果
   * ✅ 验证点 3: processNatively() 耗时显著低于 process()（约 25–30 倍差距）
   */
  private async runNativeBlur(): Promise<void> {
    hilog.debug(DOMAIN, TAG, 'runNativeBlur called, radius=%{public}d', this.radius);
    if (this.imageBytes === null) {
      return;
    }
    this.nativeDone = false;
    this.nativeMs = 0;
    try {
      const pm: image.PixelMap = await this.decodeFreshPixelMap();
      const manager: StackBlurManager = new StackBlurManager(pm);
      const t0: number = Date.now();
      const blurred: image.PixelMap = manager.processNatively(this.radius);
      const elapsed: number = Date.now() - t0;
      this.nativeMs = elapsed;
      this.nativeDone = true;
      this.displayPixelMap = blurred;
      hilog.info(DOMAIN, TAG, 'processNatively(%{public}d) done in %{public}d ms', this.radius, elapsed);
      this.statusText = 'processNatively() 完成，耗时 ' + elapsed.toString() + ' ms';
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'runNativeBlur failed: %{public}s', msg);
      this.statusText = 'Native C 模糊失败：' + msg;
    }
  }

  /**
   * 使用 RenderScript 兼容 API（processRenderScript()）执行模糊并记录耗时。
   * context 参数为 API 兼容保留，内部等价于 processNatively()。
   *
   * ✅ 验证点 2: processRenderScript() 正常返回模糊 PixelMap，视觉效果与 processNatively() 一致
   * ✅ 验证点 4: processRenderScript() 与 processNatively() 耗时接近，验证底层实现一致
   */
  private async runRenderScriptBlur(): Promise<void> {
    hilog.debug(DOMAIN, TAG, 'runRenderScriptBlur called, radius=%{public}d', this.radius);
    if (this.imageBytes === null) {
      return;
    }
    this.rsDone = false;
    this.rsMs = 0;
    try {
      const pm: image.PixelMap = await this.decodeFreshPixelMap();
      const manager: StackBlurManager = new StackBlurManager(pm);
      // context 参数为 API 兼容保留，内部实际未使用
      const context: common.Context = getContext(this);
      const t0: number = Date.now();
      const blurred: image.PixelMap = manager.processRenderScript(context, this.radius);
      const elapsed: number = Date.now() - t0;
      this.rsMs = elapsed;
      this.rsDone = true;
      this.displayPixelMap = blurred;
      hilog.info(DOMAIN, TAG, 'processRenderScript(%{public}d) done in %{public}d ms', this.radius, elapsed);
      this.statusText = 'processRenderScript() 完成，耗时 ' + elapsed.toString() + ' ms';
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'runRenderScriptBlur failed: %{public}s', msg);
      this.statusText = 'RenderScript 模糊失败：' + msg;
    }
  }

  // ─── UI 构建 ──────────────────────────────────────────────────────────────────
  // 注：耗时行直接内联在 build() 中，@State 变量直接出现在组件树属性表达式里，
  //     ArkUI 才能正确建立依赖并在状态变更时触发重渲染。
  //     @Builder 传参（by-value）时参数在子作用域中是局部拷贝，ArkUI diff 因
  //     "结构未变"跳过重渲染，导致耗时数值无法更新。

  build() {
    Scroll() {
      Column({ space: 12 }) {
        // 页面标题
        Text($r('app.string.demo_002_title'))
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 16, bottom: 4 })

        // 图片展示区
        if (this.displayPixelMap !== null) {
          Image(this.displayPixelMap)
            .width('100%')
            .height(200)
            .objectFit(ImageFit.Contain)
            .borderRadius(8)
            .backgroundColor('#EEEEEE')
        } else {
          Row()
            .width('100%')
            .height(200)
            .backgroundColor('#EEEEEE')
            .borderRadius(8)
        }

        // 状态文本
        if (this.statusText.length > 0) {
          Text(this.statusText)
            .fontSize(13)
            .fontColor('#444444')
            .width('100%')
            .padding(10)
            .backgroundColor('#F5F5F5')
            .borderRadius(6)
        }

        // 模糊半径滑块
        Row({ space: 8 }) {
          Text($r('app.string.demo_002_radius_label'))
            .fontSize(13)
            .width(70)
          Slider({
            value: this.radius,
            min: 1,
            max: 254,
            step: 1,
            style: SliderStyle.OutSet
          })
            .layoutWeight(1)
            .onChange((value: number) => {
              this.radius = Math.round(value);
            })
          Text(this.radius.toString())
            .fontSize(13)
            .width(30)
            .textAlign(TextAlign.End)
        }
        .width('100%')
        .padding({ top: 4 })

        // ── 耗时对比区 ──────────────────────────────────────────────────────────
        Column({ space: 4 }) {
          Text($r('app.string.demo_002_timing_label'))
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .width('100%')
          // ArkTS 耗时行 — 直接引用 @State，ArkUI 正确追踪变更
          Row({ space: 8 }) {
            Text('ArkTS')
              .fontSize(13)
              .width(120)
              .fontColor('#555555')
            Text(this.arktsDone ? this.arktsMs.toString() + ' ms' : '—')
              .fontSize(13)
              .fontWeight(this.arktsDone ? FontWeight.Bold : FontWeight.Normal)
              .fontColor(this.arktsDone ? '#3478F6' : '#AAAAAA')
              .layoutWeight(1)
          }
          .width('100%')
          .padding({ top: 4, bottom: 4 })

          // Native C 耗时行
          Row({ space: 8 }) {
            Text('Native C')
              .fontSize(13)
              .width(120)
              .fontColor('#555555')
            Text(this.nativeDone ? this.nativeMs.toString() + ' ms' : '—')
              .fontSize(13)
              .fontWeight(this.nativeDone ? FontWeight.Bold : FontWeight.Normal)
              .fontColor(this.nativeDone ? '#3478F6' : '#AAAAAA')
              .layoutWeight(1)
          }
          .width('100%')
          .padding({ top: 4, bottom: 4 })

          // RenderScript 耗时行
          Row({ space: 8 }) {
            Text('RenderScript')
              .fontSize(13)
              .width(120)
              .fontColor('#555555')
            Text(this.rsDone ? this.rsMs.toString() + ' ms' : '—')
              .fontSize(13)
              .fontWeight(this.rsDone ? FontWeight.Bold : FontWeight.Normal)
              .fontColor(this.rsDone ? '#3478F6' : '#AAAAAA')
              .layoutWeight(1)
          }
          .width('100%')
          .padding({ top: 4, bottom: 4 })
        }
        .width('100%')
        .padding(10)
        .backgroundColor('#FFFFFF')
        .borderRadius(8)

        // ── 操作按钮 ────────────────────────────────────────────────────────────

        Button($r('app.string.demo_002_arkts_btn'))
          .width('100%')
          .enabled(this.isLoaded)
          .onClick(() => {
            this.runArkTsBlur();
          })

        Button($r('app.string.demo_002_native_btn'))
          .width('100%')
          .enabled(this.isLoaded)
          .onClick(() => {
            this.runNativeBlur();
          })

        Button($r('app.string.demo_002_renderscript_btn'))
          .width('100%')
          .enabled(this.isLoaded)
          .onClick(() => {
            this.runRenderScriptBlur();
          })
      }
      .width('100%')
      .padding(16)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F2F3F5')
  }
}
