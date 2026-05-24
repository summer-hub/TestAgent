/**
 * By — HarmonyOS UI 组件选择器（OHOS 风格 fluent API）
 *
 * 对标 Python hypium 的 `By` 类，提供链式调用构建选择器:
 *
 * ```typescript
 * By.text('StackBlur Demo')              // Text 匹配
 * By.id('button_perform')                // ID/key 匹配
 * By.type('Button').text('性能对比')     // 复合选择
 * By.bundle('com.example.stackblur')     // 包名过滤
 * ```
 *
 * 最终通过 `.toLocator()` 转为通用 `Locator`，或通过
 * `.match(tree)` 直接在 UI 树中查找。
 */

import { Element, Locator, LocatorType, UiTree } from '@core/types/element.type';

/** 匹配模式 */
export enum MatchPattern {
  EQUALS = 'equals',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
}

/** By 内部条件节点 */
interface ByCondition {
  field: 'text' | 'id' | 'type' | 'bundleName' | 'pagePath' | 'description' | 'key' | 'resourceId';
  pattern: MatchPattern;
  value: string;
}

/** By 可选扩展条件 */
interface ByExtraCondition {
  clickable?: boolean;
  enabled?: boolean;
  visible?: boolean;
  selected?: boolean;
}

/**
 * By — 不可变链式选择器
 *
 * 每个方法返回新 By 实例（不修改原对象）：
 * ```
 * By.text('保存')                // → By { conditions: [{text, EQUALS, '保存'}] }
 *   .type('Button')              // → By { conditions: [+{type, EQUALS, 'Button'}] }
 *   .clickable(true)             // → By { clickable: true }
 * ```
 */
export class By {
  /** 文本条件 */
  readonly conditions: ReadonlyArray<ByCondition>;
  /** 额外属性条件 */
  readonly extras: Readonly<ByExtraCondition>;

  private constructor(
    conditions: ByCondition[] = [],
    extras: ByExtraCondition = {}
  ) {
    this.conditions = Object.freeze([...conditions]);
    this.extras = Object.freeze({ ...extras });
  }

  // ============ 工厂方法 ============

  /** 按文本匹配（默认 CONTAINS） */
  static text(value: string, pattern: MatchPattern = MatchPattern.CONTAINS): By {
    return new By([{ field: 'text', pattern, value }]);
  }

  /** 按 accessibilityId / key 匹配（默认 EQUALS） */
  static id(value: string, pattern: MatchPattern = MatchPattern.EQUALS): By {
    return new By([{ field: 'id', pattern, value }]);
  }

  /** 按类型匹配（Button / Text / Image / Slider / Select 等） */
  static type(typeName: string): By {
    return new By([{ field: 'type', pattern: MatchPattern.EQUALS, value: typeName }]);
  }

  /** 按包名过滤 */
  static bundle(name: string): By {
    return new By([{ field: 'bundleName', pattern: MatchPattern.EQUALS, value: name }]);
  }

  /** 按页面路径过滤（如 pages/Index） */
  static page(path: string): By {
    return new By([{ field: 'pagePath', pattern: MatchPattern.CONTAINS, value: path }]);
  }

  /** 按描述匹配 */
  static description(value: string, pattern: MatchPattern = MatchPattern.CONTAINS): By {
    return new By([{ field: 'description', pattern, value }]);
  }

  // ============ 链式方法 ============

  text(value: string, pattern: MatchPattern = MatchPattern.CONTAINS): By {
    return this._add({ field: 'text', pattern, value });
  }

  id(value: string, pattern: MatchPattern = MatchPattern.EQUALS): By {
    return this._add({ field: 'id', pattern, value });
  }

  type(typeName: string): By {
    return this._add({ field: 'type', pattern: MatchPattern.EQUALS, value: typeName });
  }

  bundle(name: string): By {
    return this._add({ field: 'bundleName', pattern: MatchPattern.EQUALS, value: name });
  }

  /** 要求元素可点击 */
  clickable(val: boolean = true): By {
    return new By([...this.conditions], { ...this.extras, clickable: val });
  }

  /** 要求元素可用 */
  enabled(val: boolean = true): By {
    return new By([...this.conditions], { ...this.extras, enabled: val });
  }

  /** 要求元素可见 */
  visible(val: boolean = true): By {
    return new By([...this.conditions], { ...this.extras, visible: val });
  }

  // ============ 匹配接口 ============

  /**
   * 在 UI 树中查找所有匹配的元素
   */
  match(tree: UiTree): Element[] {
    const results: Element[] = [];
    for (const element of tree.elements.values()) {
      if (this.test(element)) {
        results.push(element);
      }
    }
    return results;
  }

  /**
   * 在 UI 树中查找第一个匹配的元素
   */
  matchFirst(tree: UiTree): Element | null {
    for (const element of tree.elements.values()) {
      if (this.test(element)) return element;
    }
    return null;
  }

  /**
   * 测试单个元素是否匹配所有条件
   */
  test(element: Element): boolean {
    // 字段条件
    for (const c of this.conditions) {
      const actual = this._getField(element, c.field);
      if (actual === undefined || actual === null) return false;
      if (!this._matches(String(actual), c.pattern, c.value)) return false;
    }

    // 额外属性条件
    if (this.extras.clickable !== undefined && element.clickable !== this.extras.clickable) return false;
    if (this.extras.enabled !== undefined && element.enabled !== this.extras.enabled) return false;
    if (this.extras.visible !== undefined && element.visible !== this.extras.visible) return false;
    if (this.extras.selected !== undefined && (element.selected ?? false) !== this.extras.selected) return false;

    return true;
  }

  /** 转为通用 Locator 对象 */
  toLocator(): Locator {
    // 优先使用 id 条件
    const idCond = this.conditions.find(c => c.field === 'id');
    if (idCond) {
      return { type: LocatorType.ID, value: idCond.value };
    }
    // 其次使用 text 条件
    const textCond = this.conditions.find(c => c.field === 'text');
    if (textCond) {
      return { type: LocatorType.TEXT, value: textCond.value };
    }
    // 兜底
    return { type: LocatorType.TEXT, value: this.conditions[0]?.value ?? '' };
  }

  /** 是否为复合选择器（多个条件） */
  get isCompound(): boolean {
    return this.conditions.length > 1 || Object.keys(this.extras).length > 0;
  }

  // ============ 私有 ============

  private _add(cond: ByCondition): By {
    return new By([...this.conditions, cond], this.extras);
  }

  private _getField(el: Element, field: ByCondition['field']): string | undefined | null {
    switch (field) {
      case 'text': return el.text;
      case 'id':
        return el.id || el.resourceId || el.attributes?.key || el.attributes?.accessibilityId;
      case 'type': return el.type;
      case 'bundleName': return el.packageName || el.attributes?.bundleName;
      case 'pagePath': return el.attributes?.pagePath;
      case 'description': return el.description || el.contentDesc;
      case 'key': return el.attributes?.key || el.attributes?.accessibilityId;
      case 'resourceId': return el.resourceId;
      default: return undefined;
    }
  }

  private _matches(actual: string, pattern: MatchPattern, expected: string): boolean {
    switch (pattern) {
      case MatchPattern.EQUALS: return actual === expected;
      case MatchPattern.CONTAINS: return actual.includes(expected);
      case MatchPattern.STARTS_WITH: return actual.startsWith(expected);
      case MatchPattern.ENDS_WITH: return actual.endsWith(expected);
      default: return actual.includes(expected);
    }
  }

  // ============ toString ============

  toString(): string {
    const parts = this.conditions.map(c => `${c.field}[${c.pattern}]="${c.value}"`);
    if (this.extras.clickable !== undefined) parts.push(`clickable=${this.extras.clickable}`);
    if (this.extras.enabled !== undefined) parts.push(`enabled=${this.extras.enabled}`);
    if (this.extras.visible !== undefined) parts.push(`visible=${this.extras.visible}`);
    return `By(${parts.join(', ')})`;
  }
}
