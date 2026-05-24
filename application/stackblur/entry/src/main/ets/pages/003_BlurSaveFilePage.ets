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
 * Demo 003: Save Blurred Image to File
 *
 * 功能说明：展示使用 StackBlurManager 完成图像模糊后，通过 saveIntoFile() 将模糊结果以
 *           PNG 格式保存到应用沙箱路径（context.filesDir）的完整流程，并通过重新读取
 *           文件验证保存成功。同时测试 saveIntoFile() 在未执行过模糊时提前返回
 *           （不写入文件）的边界防护行为。
 *
 * 对应接口：
 *   new StackBlurManager(pixelMap: image.PixelMap)
 *   processNatively(radius: number): image.PixelMap
 *   saveIntoFile(path: string): void
 */

import { hilog } from '@kit.PerformanceAnalysisKit';
import { image } from '@kit.ImageKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { StackBlurManager } from '@ohos/stackblur';

// ─── 日志常量 ──────────────────────────────────────────────────────────────────
const DOMAIN: number = 0x0000;
const TAG: string = 'StackBlur_003SaveFile';

/** 输出文件名（保存在 context.filesDir 下） */
const OUTPUT_FILENAME: string = 'stackblur_output.png';

@Entry
@Component
struct BlurSaveFilePage {
  // ─── 状态变量（@State 响应式）──────────────────────────────────────────────────
  /** 模糊结果展示区 PixelMap */
  @State private blurredPixelMap: image.PixelMap | null = null;
  /** 从文件读回后展示的 PixelMap */
  @State private readBackPixelMap: image.PixelMap | null = null;
  /** 接口调用状态文本 */
  @State private statusText: string = '';
  /** 模糊半径（1–254，步长 1） */
  @State private radius: number = 25;
  /** 是否已执行过模糊（控制"读取并预览"按钮可用状态） */
  @State private isSaved: boolean = false;
  // ─── 非响应式成员 ──────────────────────────────────────────────────────────────
  /** 原始图像字节，用于每次解码干净的 PixelMap */
  private imageBytes: ArrayBuffer | null = null;
  /** 保存文件的完整路径 */
  private savedFilePath: string = '';

  // ─── 生命周期 ──────────────────────────────────────────────────────────────────

  aboutToAppear(): void {
    hilog.info(DOMAIN, TAG, 'Demo 003 page appeared');
    this.loadImageBytes();
    const filesDir: string = getContext(this).filesDir;
    this.savedFilePath = filesDir + '/' + OUTPUT_FILENAME;
    hilog.debug(DOMAIN, TAG, 'Output path: %{public}s', this.savedFilePath);
  }

  aboutToDisappear(): void {
    hilog.info(DOMAIN, TAG, 'Demo 003 page disappeared');
    this.imageBytes = null;
    this.blurredPixelMap = null;
    this.readBackPixelMap = null;
  }

  // ─── 核心功能方法 ──────────────────────────────────────────────────────────────

  /**
   * 从内置资源预加载图像字节（仅做一次 I/O，后续解码从内存进行）。
   */
  private loadImageBytes(): void {
    hilog.debug(DOMAIN, TAG, 'loadImageBytes called');
    try {
      const bytes: Uint8Array = getContext(this).resourceManager
        .getMediaContentSync($r('app.media.android_platform_256').id);
      this.imageBytes = bytes.buffer as ArrayBuffer;
      hilog.info(DOMAIN, TAG, 'Image bytes loaded, size=%{public}d', this.imageBytes.byteLength);
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'loadImageBytes failed: %{public}s', msg);
      this.statusText = '图片资源加载失败：' + msg;
    }
  }

  /**
   * 从内存字节解码出干净（editable=true）的 PixelMap，供模糊操作使用。
   */
  private decodeFreshPixelMap(): Promise<image.PixelMap> {
    hilog.debug(DOMAIN, TAG, 'decodeFreshPixelMap called');
    return image.createImageSource(this.imageBytes as ArrayBuffer)
      .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 });
  }

  /**
   * 边界测试：在未执行模糊的情况下直接调用 saveIntoFile()。
   * 由于 _result 为 null，saveIntoFile() 应提前返回，不写入任何文件。
   *
   * ✅ 验证点 1: 未模糊时 saveIntoFile() 提前返回，无文件写入，无异常抛出
   */
  private async testSaveWithoutBlur(): Promise<void> {
    hilog.debug(DOMAIN, TAG, 'testSaveWithoutBlur called');
    if (this.imageBytes === null) {
      this.statusText = '图片资源未就绪，请稍后重试';
      return;
    }
    try {
      const pm: image.PixelMap = await this.decodeFreshPixelMap();
      // 仅创建 manager，不执行任何模糊方法
      const manager: StackBlurManager = new StackBlurManager(pm);
      manager.saveIntoFile(this.savedFilePath);
      // 验证：保存路径文件是否存在
      const fileExists: boolean = fs.accessSync(this.savedFilePath);
      if (!fileExists) {
        hilog.info(DOMAIN, TAG, 'Boundary OK: saveIntoFile returned early (no file written)');
        this.statusText = '边界测试通过：saveIntoFile() 在 _result 为 null 时提前返回，未写入文件';
      } else {
        hilog.warn(DOMAIN, TAG, 'Boundary unexpected: file exists after saveIntoFile with null result');
        this.statusText = '边界测试：文件存在（可能为上次保存残留），请先删除文件后重测';
      }
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'testSaveWithoutBlur failed: %{public}s', msg);
      this.statusText = '边界测试异常：' + msg;
    }
  }

  /**
   * 执行模糊并将结果保存到应用沙箱路径。
   *
   * ✅ 验证点 2: saveIntoFile(path) 执行完成，无异常，状态文本显示目标路径
   * ✅ 验证点 4: 重复保存时旧文件被覆盖，预览图像更新为新 radius 结果
   */
  private async blurAndSave(): Promise<void> {
    hilog.debug(DOMAIN, TAG, 'blurAndSave called, radius=%{public}d', this.radius);
    if (this.imageBytes === null) {
      this.statusText = '图片资源未就绪，请稍后重试';
      return;
    }
    try {
      const pm: image.PixelMap = await this.decodeFreshPixelMap();
      const manager: StackBlurManager = new StackBlurManager(pm);
      const blurred: image.PixelMap = manager.processNatively(this.radius);
      this.blurredPixelMap = blurred;
      // 保存到沙箱路径（saveIntoFile 内部以 CREATE|WRITE_ONLY|TRUNC 覆盖写入）
      manager.saveIntoFile(this.savedFilePath);
      this.isSaved = true;
      hilog.info(DOMAIN, TAG, 'Saved blurred image (radius=%{public}d) to %{public}s',
        this.radius, this.savedFilePath);
      this.statusText = '已保存到：' + this.savedFilePath;
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'blurAndSave failed: %{public}s', msg);
      this.statusText = '模糊或保存失败：' + msg;
    }
  }

  /**
   * 从沙箱路径读取保存的 PNG 文件，解码为 PixelMap 并预览。
   * 验证文件确实存在且内容为有效图像。
   *
   * ✅ 验证点 3: 从文件读取成功，解码图像与 processNatively() 结果视觉一致
   */
  private async readBackFile(): Promise<void> {
    hilog.debug(DOMAIN, TAG, 'readBackFile called from %{public}s', this.savedFilePath);
    try {
      const fileExists: boolean = fs.accessSync(this.savedFilePath);
      if (!fileExists) {
        this.statusText = '文件不存在，请先执行"执行模糊并保存"';
        return;
      }
      const file: fs.File = fs.openSync(this.savedFilePath, fs.OpenMode.READ_ONLY);
      const imgSource: image.ImageSource = image.createImageSource(file.fd);
      imgSource.createPixelMap({ editable: false })
        .then((pm: image.PixelMap) => {
          fs.closeSync(file.fd);
          this.readBackPixelMap = pm;
          hilog.info(DOMAIN, TAG, 'Read back PNG from file successfully');
          this.statusText = '文件读取成功，已预览：' + this.savedFilePath;
        })
        .catch((err: Error) => {
          fs.closeSync(file.fd);
          hilog.error(DOMAIN, TAG, 'createPixelMap from file failed: %{public}s', err.message);
          this.statusText = '文件解码失败：' + err.message;
        });
    } catch (err) {
      const msg: string = (err as Error).message ?? String(err);
      hilog.error(DOMAIN, TAG, 'readBackFile failed: %{public}s', msg);
      this.statusText = '读取文件失败：' + msg;
    }
  }

  // ─── UI 构建 ──────────────────────────────────────────────────────────────────

  build() {
    Scroll() {
      Column({ space: 12 }) {
        // 页面标题
        Text($r('app.string.demo_003_title'))
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 16, bottom: 4 })

        // 模糊结果展示区
        Column({ space: 6 }) {
          Text($r('app.string.demo_003_result_label'))
            .fontSize(13)
            .fontColor('#555555')
            .width('100%')
          if (this.blurredPixelMap !== null) {
            Image(this.blurredPixelMap)
              .width('100%')
              .height(160)
              .objectFit(ImageFit.Contain)
              .borderRadius(8)
              .backgroundColor('#EEEEEE')
          } else {
            Row()
              .width('100%')
              .height(160)
              .backgroundColor('#EEEEEE')
              .borderRadius(8)
          }
        }

        // 文件预览区
        Column({ space: 6 }) {
          Text($r('app.string.demo_003_file_preview_label'))
            .fontSize(13)
            .fontColor('#555555')
            .width('100%')
          if (this.readBackPixelMap !== null) {
            Image(this.readBackPixelMap)
              .width('100%')
              .height(160)
              .objectFit(ImageFit.Contain)
              .borderRadius(8)
              .backgroundColor('#EEEEEE')
          } else {
            Row()
              .width('100%')
              .height(160)
              .backgroundColor('#EEEEEE')
              .borderRadius(8)
          }
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
          Text($r('app.string.demo_003_radius_label'))
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

        Button($r('app.string.demo_003_boundary_btn'))
          .width('100%')
          .onClick(() => {
            this.testSaveWithoutBlur();
          })

        Button($r('app.string.demo_003_blur_save_btn'))
          .width('100%')
          .onClick(() => {
            this.blurAndSave();
          })

        Button($r('app.string.demo_003_read_back_btn'))
          .width('100%')
          .enabled(this.isSaved)
          .onClick(() => {
            this.readBackFile();
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
