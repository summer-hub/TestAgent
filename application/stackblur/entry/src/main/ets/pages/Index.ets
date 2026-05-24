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
 * Index Page — StackBlur 主演示页面
 *
 * 对应 Android StackBlurDemo 中的 MainActivity：
 *  - 加载两张测试图片（android_platform_256.png / image_transparency.png）
 *  - 拖动滑块实时调整模糊半径（1–50 px，步长 1，对应 Android seekBar × 5）
 *  - 下拉选择模糊实现方式：ArkTS / Native C
 *  - 顶部按钮跳转到 Benchmark 页面
 */

import { hilog } from '@kit.PerformanceAnalysisKit';
import { image } from '@kit.ImageKit';
import { router } from '@kit.ArkUI';
import { StackBlurManager } from '@ohos/stackblur';

const DOMAIN = 0x0000;

// 模糊模式枚举，对应原 Android Spinner 的 blur_modes
enum BlurMode {
  ArkTS = 0,
  Native = 1
}

const BLUR_MODE_LABELS: string[] = ['ArkTS', 'Native C'];

@Entry
@Component
struct Index {
  // 当前加载的原始 PixelMap
  @State originalPixelMap: image.PixelMap | null = null;
  // 模糊后的 PixelMap
  @State blurredPixelMap: image.PixelMap | null = null;
  // 模糊半径（对应 Android seekBar progress，1-50）
  @State radius: number = 10;
  // 当前选中的模糊模式
  @State blurMode: BlurMode = BlurMode.ArkTS;
  // 是否正在处理（防止重入）
  @State isBusy: boolean = false;
  // 状态提示文字
  @State statusText: string = '拖动滑块即可实时模糊';
  // 是否使用透明通道测试图（对应 Android ToggleButton）
  @State useTransparencyImage: boolean = false;

  aboutToAppear(): void {
    this.loadImageAndBlur();
  }

  /** 加载当前选中的图片资源，并触发一次模糊 */
  private loadImageAndBlur(): void {
    const resId: number = this.useTransparencyImage
      ? $r('app.media.image_transparency').id
      : $r('app.media.android_platform_256').id;

    try {
      const bytes: Uint8Array = getContext(this).resourceManager.getMediaContentSync(resId);
      const imgSource: image.ImageSource = image.createImageSource(bytes.buffer as ArrayBuffer);
      const decodeOpts: image.DecodingOptions = {
        editable: true,
        desiredPixelFormat: image.PixelMapFormat.BGRA_8888,
      };
      imgSource.createPixelMap(decodeOpts).then((pm: image.PixelMap) => {
        this.originalPixelMap = pm;
        this.applyBlur();
      }).catch((err: Error) => {
        hilog.error(DOMAIN, 'StackBlurDemo', 'load image failed: %{public}s', err.message);
      });
    } catch (err) {
      hilog.error(DOMAIN, 'StackBlurDemo', 'getMediaContent failed: %{public}s', (err as Error).message);
    }
  }

  /** 对当前原图以当前半径和模式执行模糊 */
  private applyBlur(): void {
    if (this.isBusy || this.originalPixelMap === null) {
      return;
    }
    this.isBusy = true;
    const label: string = BLUR_MODE_LABELS[this.blurMode];
    this.statusText = `${label} 处理中 radius=${this.radius}…`;

    const manager: StackBlurManager = new StackBlurManager(this.originalPixelMap);
    const startTs: number = Date.now();

    try {
      const result: image.PixelMap = this.blurMode === BlurMode.Native
        ? manager.processNatively(this.radius)
        : manager.process(this.radius);
      this.blurredPixelMap = result;
      const elapsed: number = Date.now() - startTs;
      this.statusText = `${label}  radius=${this.radius}  耗时 ${elapsed} ms`;
      hilog.info(DOMAIN, 'StackBlurDemo', '%{public}s blur done in %{public}d ms', label, elapsed);
    } catch (err) {
      this.statusText = `错误: ${(err as Error).message}`;
      hilog.error(DOMAIN, 'StackBlurDemo', 'blur error: %{public}s', (err as Error).message);
    } finally {
      this.isBusy = false;
    }
  }

  build() {
    Scroll() {
      Column({ space: 14 }) {

        // ── 标题栏 ──────────────────────────────────────────────────────────
        Row() {
          Text('StackBlur Demo')
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .layoutWeight(1)
          Button('性能对比')
            .fontSize(13)
            .height(36)
            .onClick(() => {
              router.pushUrl({ url: 'pages/Benchmark' });
            })
        }
        .width('100%')

        // ── 原图 ────────────────────────────────────────────────────────────
        Text('原始图像').fontSize(13).fontColor(Color.Gray).alignSelf(ItemAlign.Start)
        if (this.originalPixelMap !== null) {
          Image(this.originalPixelMap as image.PixelMap)
            .width('100%')
            .aspectRatio(1.6)
            .objectFit(ImageFit.Contain)
            .backgroundColor('#F0F0F0')
        }

        // ── 模糊结果 ────────────────────────────────────────────────────────
        Text('模糊结果').fontSize(13).fontColor(Color.Gray).alignSelf(ItemAlign.Start)
        if (this.blurredPixelMap !== null) {
          Image(this.blurredPixelMap as image.PixelMap)
            .width('100%')
            .aspectRatio(1.6)
            .objectFit(ImageFit.Contain)
            .backgroundColor('#F0F0F0')
            .border({ width: 1, color: '#0A59F7' })
        }

        // ── 图片选择（对应 Android ToggleButton）───────────────────────────
        Row({ space: 10 }) {
          Text('图片:').fontSize(14)
          Toggle({ type: ToggleType.Button, isOn: !this.useTransparencyImage }) {
            Text(this.useTransparencyImage ? '透明通道图' : 'Android 平台图').fontSize(13)
          }
          .selectedColor('#0A59F7')
          .onChange((isOn: boolean) => {
            this.useTransparencyImage = !isOn;
            this.blurredPixelMap = null;
            this.loadImageAndBlur();
          })
        }
        .width('100%')

        // ── 模式选择（对应 Android Spinner）────────────────────────────────
        Row({ space: 10 }) {
          Text('模式:').fontSize(14)
          Select(BLUR_MODE_LABELS.map((label: string) => ({ value: label } as SelectOption)))
            .selected(this.blurMode)
            .value(BLUR_MODE_LABELS[this.blurMode])
            .onSelect((index: number) => {
              this.blurMode = index as BlurMode;
              this.applyBlur();
            })
        }
        .width('100%')

        // ── 半径滑块（对应 Android SeekBar，对应值 progress × 5 → 这里 1-50）
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
              this.applyBlur();
            })
        }
        .width('100%')

        // ── 状态提示 ────────────────────────────────────────────────────────
        Text(this.statusText)
          .fontSize(12)
          .fontColor(this.isBusy ? Color.Orange : Color.Gray)
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

