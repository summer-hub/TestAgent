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
 * Demo 001: ArkTS Image Blur
 *
 * 功能说明：展示使用 StackBlurManager 的纯 ArkTS 实现（process()）对图像执行模糊处理，
 *           通过 returnBlurredImage() 获取最近模糊结果，通过 getImage() 获取原始未修改图像。
 *           验证 returnBlurredImage() 在未执行过模糊时返回 null 的边界行为。
 *
 * 对应接口：
 *   new StackBlurManager(pixelMap: image.PixelMap)
 *   process(radius: number): image.PixelMap
 *   returnBlurredImage(): image.PixelMap | null
 *   getImage(): image.PixelMap
 */

import { hilog } from '@kit.PerformanceAnalysisKit';
import { image } from '@kit.ImageKit';
import { StackBlurManager } from '@ohos/stackblur';

// ─── 日志常量 ──────────────────────────────────────────────────────────────────
const DOMAIN: number = 0x0000;
const TAG: string = 'StackBlur_001ArkTsBlur';

@Entry
@Component
struct ArkTsBlurPage {
  // ─── 状态变量（@State 响应式）──────────────────────────────────────────────────
  /** 图片展示区当前显示的 PixelMap */
  @State private displayPixelMap: image.PixelMap | null = null;
  /** 接口调用状态文本 */
  @State private statusText: string = '';
  /** 模糊半径（1–50，步长 1） */
  @State private radius: number = 25;
  /** 是否已加载图片（控制模糊按钮可用状态） */
  @State private isLoaded: boolean = false;
  // ─── 非响应式成员 ──────────────────────────────────────────────────────────────
  /** StackBlurManager 实例，在 loadTestImage 后初始化 */
  private manager: StackBlurManager | null = null;

  // ─── 生命周期 ──────────────────────────────────────────────────────────────────

  aboutToAppear(): void {
    hilog.info(DOMAIN, TAG, 'Demo 001 page appeared');
  }

  aboutToDisappear(): void {
    hilog.info(DOMAIN, TAG, 'Demo 001 page disappeared');
    // 释放 PixelMap 引用
    this.manager = null;
    this.displayPixelMap = null;
  }

  // ─── 核心功能方法 ──────────────────────────────────────────────────────────────

  /**
   * 从内置资源加载测试图片，创建 StackBlurManager 实例。
   * 此时不执行模糊，保持 _result 为 null，用于测试 returnBlurredImage() 边界行为。
   */
  private loadTestImage(): void {
    hilog.debug(DOMAIN, TAG, 'loadTestImage called');
    try {
      const bytes: Uint8Array = getContext(this).resourceManager
        .getMediaContentSync($r('app.media.android_platform_256').id);
      image.createImageSource(bytes.buffer as ArrayBuffer)
        .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 })
        .then((pm: image.PixelMap) => {
          this.manager = new StackBlurManager(pm);
          this.displayPixelMap = pm;
          this.isLoaded = true;
          hilog.info(DOMAIN, TAG, 'Image loaded, StackBlurManager created (no blur yet)');
          this.statusText = '图片已加载，StackBlurManager 已创建（未执行模糊）';
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
   * 调用 returnBlurredImage()，验证在未执行模糊时返回 null 的边界行为，
   * 以及模糊执行后返回有效 PixelMap。
   *
   * ✅ 验证点 1: 未执行过模糊时返回 null，状态文本正确显示"返回 null"，无异常抛出
   * ✅ 验证点 3: 模糊执行后，returnBlurredImage() 返回非 null 的 PixelMap
   */
  private getBlurredResult(): void {
    hilog.debug(DOMAIN, TAG, 'getBlurredResult called');
    if (this.manager === null) {
      this.statusText = '请先点击"加载测试图片"';
      return;
    }
    const result: image.PixelMap | null = this.manager.returnBlurredImage();
    if (result === null) {
      hilog.info(DOMAIN, TAG, 'returnBlurredImage() returned null');
      this.statusText = 'returnBlurredImage() 返回 null（未执行过模糊）';
    } else {
      this.displayPixelMap = result;
      hilog.info(DOMAIN, TAG, 'returnBlurredImage() returned valid PixelMap');
      this.statusText = 'returnBlurredImage() 返回有效 PixelMap';
    }
  }

  /**
   * 使用纯 ArkTS 实现（process()）对图像执行模糊处理。
   *
   * ✅ 验证点 2: process(radius) 返回模糊后的 PixelMap，结果展示区图像有明显模糊效果
   * ✅ 验证点 5: radius 增大后模糊程度明显加深，验证参数生效
   */
  private applyArkTsBlur(): void {
    hilog.debug(DOMAIN, TAG, 'applyArkTsBlur called, radius=%{public}d', this.radius);
    if (this.manager === null) {
      this.statusText = '请先点击"加载测试图片"';
      return;
    }
    try {
      const blurred: image.PixelMap = this.manager.process(this.radius);
      this.displayPixelMap = blurred;
      hilog.info(DOMAIN, TAG, 'process(%{public}d) succeeded', this.radius);
      this.statusText = 'process(' + this.radius.toString() + ') 执行完成';
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'process failed: %{public}s', msg);
      this.statusText = '执行模糊失败：' + msg;
    }
  }

  /**
   * 调用 getImage()，返回构造时传入的原始未修改图像。
   *
   * ✅ 验证点 4: getImage() 返回的图像与构造时传入的 PixelMap 一致，无模糊效果
   */
  private showOriginalImage(): void {
    hilog.debug(DOMAIN, TAG, 'showOriginalImage called');
    if (this.manager === null) {
      this.statusText = '请先点击"加载测试图片"';
      return;
    }
    const original: image.PixelMap = this.manager.getImage();
    this.displayPixelMap = original;
    hilog.info(DOMAIN, TAG, 'getImage() returned original PixelMap');
    this.statusText = 'getImage() 返回原始图像';
  }

  // ─── UI 构建 ──────────────────────────────────────────────────────────────────

  build() {
    Scroll() {
      Column({ space: 12 }) {
        // 页面标题
        Text($r('app.string.demo_001_title'))
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 16, bottom: 4 })

        // 图片展示区
        if (this.displayPixelMap !== null) {
          Image(this.displayPixelMap)
            .width('100%')
            .height(220)
            .objectFit(ImageFit.Contain)
            .borderRadius(8)
            .backgroundColor('#EEEEEE')
        } else {
          Row()
            .width('100%')
            .height(220)
            .backgroundColor('#EEEEEE')
            .borderRadius(8)
            .justifyContent(FlexAlign.Center)
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
          Text($r('app.string.demo_001_radius_label'))
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

        // ── 操作按钮 ────────────────────────────────────────────────────────────

        Button($r('app.string.demo_001_load_image_btn'))
          .width('100%')
          .onClick(() => this.loadTestImage())

        Button($r('app.string.demo_001_get_result_btn'))
          .width('100%')
          .enabled(this.isLoaded)
          .onClick(() => this.getBlurredResult())

        Button($r('app.string.demo_001_blur_btn'))
          .width('100%')
          .enabled(this.isLoaded)
          .onClick(() => this.applyArkTsBlur())

        Button($r('app.string.demo_001_get_origin_btn'))
          .width('100%')
          .enabled(this.isLoaded)
          .onClick(() => this.showOriginalImage())
      }
      .width('100%')
      .padding(16)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F2F3F5')
  }
}
