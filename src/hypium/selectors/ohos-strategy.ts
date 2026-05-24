/**
 * OHOS 选择器策略
 *
 * 针对 HarmonyOS uitest 树特有的属性优化：
 * - type（Button / Text / Slider / Select / Image 等）
 * - bundleName（包名过滤）
 * - pagePath（页面路径过滤）
 * - key / accessibilityId（组件 key 定位）
 *
 * 与 src/selector-strategy.ts 中的通用策略互补，
 * 在回退链中排在通用策略之前。
 */

import { Element, Locator, LocatorType, UiTree } from '@core/types/element.type';
import type { ISelectorStrategy } from './selector-strategy';

/**
 * Type 选择器策略 — 按 OHOS 组件类型精确匹配
 *
 * OHOS 常见类型: Text, Button, Image, Slider, Select, Toggle,
 *                 Progress, List, ListItem, Scroll, Column, Row, Flex, etc.
 */
export class OhosTypeSelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.XPATH; // 复用 XPATH 槽位

  find(tree: UiTree, locator: Locator): Element[] {
    const results: Element[] = [];
    const targetType = locator.value;
    for (const element of tree.elements.values()) {
      if (element.type.toLowerCase() === targetType.toLowerCase()) {
        results.push(element);
      }
    }
    return results;
  }

  matches(element: Element, value: string): boolean {
    return element.type.toLowerCase() === value.toLowerCase();
  }
}

/**
 * Bundle 选择器策略 — 按包名过滤
 */
export class OhosBundleSelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.XPATH;

  find(tree: UiTree, locator: Locator): Element[] {
    const results: Element[] = [];
    for (const element of tree.elements.values()) {
      if (element.packageName?.includes(locator.value)) {
        results.push(element);
      }
    }
    return results;
  }

  matches(element: Element, value: string): boolean {
    return (element.packageName || '').includes(value);
  }
}

/**
 * Key 选择器策略 — 按 accessibilityId / key 精确匹配
 * OHOS 的 key 属性是组件在代码中设置的唯一标识
 */
export class OhosKeySelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.ID;

  find(tree: UiTree, locator: Locator): Element[] {
    const results: Element[] = [];
    for (const element of tree.elements.values()) {
      if (this.matches(element, locator.value)) {
        results.push(element);
      }
    }
    return results;
  }

  matches(element: Element, value: string): boolean {
    const key = element.attributes?.key || element.attributes?.accessibilityId || '';
    if (key === value) return true;
    if (key.endsWith(`/${value}`) || key.endsWith(`:${value}`)) return true;
    return false;
  }
}

/**
 * PagePath 选择器策略 — 按当前页面路径过滤
 */
export class OhosPagePathSelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.XPATH;

  find(tree: UiTree, locator: Locator): Element[] {
    const results: Element[] = [];
    for (const element of tree.elements.values()) {
      const pagePath = element.attributes?.pagePath || '';
      if (pagePath.includes(locator.value)) {
        results.push(element);
      }
    }
    return results;
  }

  matches(element: Element, value: string): boolean {
    return (element.attributes?.pagePath || '').includes(value);
  }
}
