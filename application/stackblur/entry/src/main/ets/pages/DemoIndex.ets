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
 * DemoIndex — StackBlur Demo 主导航页面
 *
 * 提供所有 Demo 的入口列表，通过 router.pushUrl 跳转到各 Demo 页面。
 */

import { hilog } from '@kit.PerformanceAnalysisKit';
import { router } from '@kit.ArkUI';

// ─── 日志常量 ──────────────────────────────────────────────────────────────────
const DOMAIN: number = 0x0000;
const TAG: string = 'StackBlur_DemoIndex';

/** Demo 条目数据结构（title/description 使用 Resource 类型，支持国际化） */
interface DemoEntry {
  id: string;
  title: Resource;
  description: Resource;
  route: string;
}

/** Demo 列表配置（按序号排列；title/description 必须用 $r() 引用，禁止硬编码字符串） */
const DEMO_LIST: DemoEntry[] = [
  {
    id: '001',
    title: $r('app.string.demo_001_title'),
    description: $r('app.string.demo_001_index_desc'),
    route: 'pages/001_ArkTsBlurPage'
  },
  {
    id: '002',
    title: $r('app.string.demo_002_title'),
    description: $r('app.string.demo_002_index_desc'),
    route: 'pages/002_NativeBlurComparePage'
  },
  {
    id: '003',
    title: $r('app.string.demo_003_title'),
    description: $r('app.string.demo_003_index_desc'),
    route: 'pages/003_BlurSaveFilePage'
  },
  {
    id: '004',
    title: $r('app.string.demo_004_title'),
    description: $r('app.string.demo_004_index_desc'),
    route: 'pages/Index'
  }
];

@Entry
@Component
struct DemoIndex {
  build() {
    Column() {
      Text($r('app.string.demo_index_title'))
        .fontSize(22)
        .fontWeight(FontWeight.Bold)
        .width('100%')
        .textAlign(TextAlign.Center)
        .padding({ top: 20, bottom: 16 })

      List({ space: 8 }) {
        ForEach(DEMO_LIST, (demo: DemoEntry) => {
          ListItem() {
            this.DemoCard(demo)
          }
        }, (demo: DemoEntry) => demo.id)
      }
      .width('100%')
      .layoutWeight(1)
      .padding({ left: 16, right: 16 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F2F3F5')
  }

  @Builder
  DemoCard(demo: DemoEntry): void {
    Row({ space: 12 }) {
      // 序号徽章
      Text(demo.id)
        .fontSize(14)
        .fontWeight(FontWeight.Bold)
        .fontColor('#FFFFFF')
        .width(44)
        .height(44)
        .textAlign(TextAlign.Center)
        .backgroundColor('#3478F6')
        .borderRadius(22)

      // 标题 + 描述（Resource 类型，直接传入 Text）
      Column({ space: 4 }) {
        Text(demo.title)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .width('100%')
        Text(demo.description)
          .fontSize(11)
          .fontColor('#888888')
          .width('100%')
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      // 箭头
      Text('›')
        .fontSize(20)
        .fontColor('#BBBBBB')
    }
    .width('100%')
    .padding({
      left: 16,
      right: 16,
      top: 12,
      bottom: 12
    })
    .backgroundColor(Color.White)
    .borderRadius(8)
    .onClick(() => {
      hilog.info(DOMAIN, TAG, 'Navigate to demo: %{public}s', demo.id);
      router.pushUrl({ url: demo.route })
        .catch((err: Error) => {
          hilog.error(DOMAIN, TAG, 'Navigation failed: %{public}s', err.message);
        });
    })
  }
}
