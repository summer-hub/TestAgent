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
 * BlurProcess — interface for all blur implementations.
 *
 * Ported from android-stackblur BlurProcess.java
 */

import { image } from '@kit.ImageKit';

export interface BlurProcess {
  /**
   * Applies blur to the given PixelMap with the specified radius.
   * If radius is 0, the original PixelMap is returned unchanged.
   *
   * @param original source PixelMap (not modified)
   * @param radius   blur radius in pixels (0–254)
   * @returns        a new blurred PixelMap
   */
  blur(original: image.PixelMap, radius: number): image.PixelMap;
}
