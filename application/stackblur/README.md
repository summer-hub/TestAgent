<div align="center">

# stackblur

</div>

This project is developed based on [android-stackblur](https://github.com/kikoso/android-stackblur).

## Introduction

stackblur is an image blur library for OpenHarmony, implementing the StackBlur algorithm by Mario Klingemann.

## Preview

![Preview](image/demo.png)

## Installation

```bash
ohpm install @ohos/stackblur
```

For more details on configuring the OpenHarmony ohpm environment, refer to [How to Install OpenHarmony ohpm Packages](https://gitcode.com/openharmony-tpc/docs/blob/master/OpenHarmony_har_usage.md).

## Constraints

### Compatibility

Verified on the following versions:

- DevEco Studio: 6.0.1 Beta1(6.0.1.103), SDK: API20(6.0.0.20), ROM: 5.1.0.120;

### Required Permissions

None

## Usage Example

```typescript
import { StackBlurManager } from '@ohos/stackblur';
import { image } from '@kit.ImageKit';

@Entry
@Component
struct BlurDemoPage {
  @State private blurredPixelMap: image.PixelMap | null = null;
  @State private statusText: string = '';

  // Cache image bytes after loading to avoid repeated I/O
  private imageBytes: ArrayBuffer | null = null;

  aboutToAppear(): void {
    // Preload image bytes
    const bytes: Uint8Array = getContext(this).resourceManager
      .getMediaContentSync($r('app.media.test_image').id);
    this.imageBytes = bytes.buffer as ArrayBuffer;
  }

  // Apply blur
  private applyBlur(radius: number): void {
    if (this.imageBytes === null) {
      return;
    }
    image.createImageSource(this.imageBytes)
      .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 })
      .then((pm: image.PixelMap) => {
        // Create StackBlurManager and apply blur
        const manager = new StackBlurManager(pm);
        const blurred: image.PixelMap = manager.processNatively(radius);
        this.blurredPixelMap = blurred;
        this.statusText = `Blur applied, radius: ${radius}`;
      });
  }

  build() {
    Column({ space: 16 }) {
      Text(this.statusText)
      Image(this.blurredPixelMap)
        .width(300)
        .height(300)
        .objectFit(ImageFit.Contain)
      Button('Apply Blur (radius=25)')
        .onClick(() => this.applyBlur(25))
    }
    .padding(16)
    .width('100%')
  }
}
```

## Usage Guide

> **Important Note**: `process()`, `processNatively()`, and `processRenderScript()` all internally use the Native C high-performance implementation and are essentially equivalent. These three methods are provided for API compatibility with the original Android version to facilitate migration from Android projects.

### 1. Using process()

```typescript
import { StackBlurManager } from '@ohos/stackblur';
import { image } from '@kit.ImageKit';

// Decode the image into an editable PixelMap
const bytes: Uint8Array = getContext(this).resourceManager
  .getMediaContentSync($r('app.media.test_image').id);
image.createImageSource(bytes.buffer as ArrayBuffer)
  .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 })
  .then((pm: image.PixelMap) => {
    const manager = new StackBlurManager(pm);
    // radius range: 1–254
    const blurred: image.PixelMap = manager.process(25);
  });
```

### 2. Using processNatively()

Completely equivalent to `process()`, with a method name that more clearly indicates the Native implementation:

```typescript
import { StackBlurManager } from '@ohos/stackblur';
import { image } from '@kit.ImageKit';

const bytes: Uint8Array = getContext(this).resourceManager
  .getMediaContentSync($r('app.media.test_image').id);
image.createImageSource(bytes.buffer as ArrayBuffer)
  .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 })
  .then((pm: image.PixelMap) => {
    const manager = new StackBlurManager(pm);
    const blurred: image.PixelMap = manager.processNatively(25);
  });
```

### 3. RenderScript Compatible API (Android Migration)

Use `processRenderScript()` when migrating from Android; it is completely equivalent to `process()` and `processNatively()`:

```typescript
import { StackBlurManager } from '@ohos/stackblur';
import { image } from '@kit.ImageKit';
import { common } from '@kit.AbilityKit';

const context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
const bytes: Uint8Array = context.resourceManager
  .getMediaContentSync($r('app.media.test_image').id);
image.createImageSource(bytes.buffer as ArrayBuffer)
  .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 })
  .then((pm: image.PixelMap) => {
    const manager = new StackBlurManager(pm);
    // context is retained for Android API compatibility; NativeBlurProcess is used internally
    const blurred: image.PixelMap = manager.processRenderScript(context, 25);
  });
```

### 4. Retrieving Blur Result and Original Image

```typescript
const manager = new StackBlurManager(pm);

// Before blur, returnBlurredImage() returns null
const beforeBlur: image.PixelMap | null = manager.returnBlurredImage(); // null

// Apply blur
manager.processNatively(25);

// Get the most recent blur result
const blurred: image.PixelMap | null = manager.returnBlurredImage(); // valid PixelMap

// Get the original unmodified image passed to the constructor
const original: image.PixelMap = manager.getImage();
```

### 5. Saving the Blurred Result to a File

```typescript
import { StackBlurManager } from '@ohos/stackblur';
import { image } from '@kit.ImageKit';

const filesDir: string = getContext(this).filesDir;
const outputPath: string = filesDir + '/stackblur_output.png';

const bytes: Uint8Array = getContext(this).resourceManager
  .getMediaContentSync($r('app.media.test_image').id);
image.createImageSource(bytes.buffer as ArrayBuffer)
  .createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.BGRA_8888 })
  .then((pm: image.PixelMap) => {
    const manager = new StackBlurManager(pm);
    manager.processNatively(25);
    // Save the blur result as PNG to the application sandbox; path must be an absolute sandbox path
    manager.saveIntoFile(outputPath);
  });
```

> Note: `saveIntoFile()` returns immediately without writing any file if no blur has been performed. Ensure `process()`, `processNatively()`, or `processRenderScript()` has been called before invoking `saveIntoFile()`.

## API Reference

### API

| Name | Description | Type | Parameters | Return Value |
|------|-------------|------|------------|--------------|
| `constructor` | Creates a StackBlurManager instance and initializes the PixelMap to process | Constructor | `pixelMap: image.PixelMap` | - |
| `process` | Blurs the image using the Native C high-performance implementation. Radius must be at least 1 | Method | `radius: number` | `image.PixelMap` |
| `processNatively` | Blurs the image using the Native C high-performance implementation, completely equivalent to `process()` | Method | `radius: number` | `image.PixelMap` |
| `processRenderScript` | Blurs the image using the Native C high-performance implementation, completely equivalent to `process()`. `context` is retained for Android API compatibility | Method | `context: common.Context, radius: number` | `image.PixelMap` |
| `returnBlurredImage` | Returns the most recent blur result, or `null` if no blur has been performed | Method | - | `image.PixelMap \| null` |
| `getImage` | Returns the original unmodified image passed to the constructor | Method | - | `image.PixelMap` |
| `saveIntoFile` | Saves the most recent blur result as a PNG file to the specified path | Method | `path: string` | `void` |

#### Parameter Details

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| `pixelMap` | `image.PixelMap` | Yes | - | Source image to blur; must be created with `editable: true` |
| `radius` | `number` | Yes | 1–254 | Blur radius; larger values produce stronger blur |
| `context` | `common.Context` | Yes | - | Retained for Android API compatibility; not used internally |
| `path` | `string` | Yes | - | Absolute path within the application sandbox, e.g. `context.filesDir + '/output.png'` |

## Obfuscation

Add the following configuration to the `obfuscation-rules.txt` file of the corresponding module:

```
-keep ./oh_modules/@ohos/stackblur
```

## Repository Structure

```
HO_stackblur
├── AppScope                      # Application-level resources and configuration
├── entry                         # Demo entry module
│   └── src/main/ets/pages        # Demo pages
├── library                       # Core library module (HAR)
│   ├── Index.ets                 # Library entry, exports StackBlurManager
│   └── src/main
│       ├── ets/stackblur         # ArkTS core implementation
│       │   ├── StackBlurManager.ets   # Main entry class
│       │   ├── BlurProcess.ets        # Internal interface definition
│       │   ├── JSBlurProcess.ets      # ArkTS blur implementation (retained for interface compatibility)
│       │   └── NativeBlurProcess.ets  # Native C blur wrapper
│       └── cpp                   # Native C blur algorithm implementation
└── oh_modules                    # Dependency modules
```

## Contributing

Feel free to submit Issues or PRs if you encounter any problems.

## License

This project is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt).
