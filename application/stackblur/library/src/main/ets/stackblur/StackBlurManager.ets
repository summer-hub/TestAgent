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
 * StackBlurManager — main entry point for the StackBlur library.
 *
 * Ported from android-stackblur StackBlurManager.java
 *
 * @Author: Enrique López Mañas (original Android version)
 * @Ported to HarmonyOS ArkTS
 * @license Apache License 2.0
 *
 * Usage:
 *   const manager = new StackBlurManager(pixelMap);
 *   const blurred = manager.process(25);          // pure ArkTS
 *   const blurred = manager.processNatively(25);  // Native C (faster)
 */

import { image } from '@kit.ImageKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { common } from '@kit.AbilityKit';
import { BlurProcess } from './BlurProcess';
import { JSBlurProcess } from './JSBlurProcess';
import { NativeBlurProcess } from './NativeBlurProcess';

export class StackBlurManager {

  /** Original image passed to the constructor. */
  private readonly _image: image.PixelMap;

  /** Most recent blur result. */
  private _result: image.PixelMap | null = null;

  /** Default blur process (ArkTS implementation). */
  private readonly _blurProcess: BlurProcess;

  /**
   * Creates a StackBlurManager for the given PixelMap.
   *
   * @param pixelMap source image to blur
   */
  constructor(pixelMap: image.PixelMap) {
    this._image = pixelMap;
    this._blurProcess = new JSBlurProcess();
  }

  /**
   * Blurs the image using the pure ArkTS implementation.
   * Radius must be at least 1.
   *
   * @param radius blur radius (1–254)
   * @returns blurred PixelMap
   */
  process(radius: number): image.PixelMap {
    const nativeBlur: NativeBlurProcess = new NativeBlurProcess();
    const result: image.PixelMap = nativeBlur.blur(this._image, radius);
    this._result = result;
    return result;
  }

  /**
   * Blurs the image using the high-performance Native C implementation.
   * 25–30× faster than process().
   *
   * @param radius blur radius (1–254)
   * @returns blurred PixelMap
   */
  processNatively(radius: number): image.PixelMap {
    const nativeBlur: NativeBlurProcess = new NativeBlurProcess();
    const result: image.PixelMap = nativeBlur.blur(this._image, radius);
    this._result = result;
    return result;
  }

  /**
   * Blurs the image using the best available high-performance implementation.
   * Ported from android-stackblur processRenderScript(); the context parameter
   * is accepted for API compatibility with the original Android library.
   *
   * Note: HarmonyOS has no RenderScript equivalent. The Android implementation
   * falls back to NativeBlurProcess when RenderScript is unavailable; here
   * NativeBlurProcess is always used as the highest-performance option.
   *
   * @param context application context (accepted for API compatibility, not used internally)
   * @param radius  blur radius (1–254)
   * @returns blurred PixelMap
   */
  processRenderScript(context: common.Context, radius: number): image.PixelMap {
    const nativeBlur: NativeBlurProcess = new NativeBlurProcess();
    const result: image.PixelMap = nativeBlur.blur(this._image, radius);
    this._result = result;
    return result;
  }

  /**
   * Returns the most recent blurred image, or null if no blur has been performed.
   */
  returnBlurredImage(): image.PixelMap | null {
    return this._result;
  }

  /**
   * Returns the original unmodified image.
   */
  getImage(): image.PixelMap {
    return this._image;
  }

  /**
   * Saves the most recent blurred image to the given file path as PNG.
   * The path should be inside the application sandbox (e.g. context.filesDir).
   *
   * @param path absolute file path to write
   */
  saveIntoFile(path: string): void {
    if (this._result === null) {
      return;
    }
    const file: fs.File = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    const imagePacker: image.ImagePacker = image.createImagePacker();
    const packOpts: image.PackingOption = { format: 'image/png', quality: 90 };
    imagePacker.packToFile(this._result, file.fd, packOpts);
    imagePacker.release();
    fs.closeSync(file.fd);
  }
}
