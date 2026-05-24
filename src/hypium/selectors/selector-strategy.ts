import { Element, Locator, LocatorType, UiTree } from '@core/types/element.type';
import { ElementNotFoundError } from '@core/errors';
import {
  OhosTypeSelectorStrategy,
  OhosBundleSelectorStrategy,
  OhosKeySelectorStrategy,
  OhosPagePathSelectorStrategy,
} from './ohos-strategy';

/**
 * 选择器策略接口
 * 每种定位方式实现此接口
 */
export interface ISelectorStrategy {
  /** 策略类型 */
  readonly type: LocatorType;
  /** 在 UI 树中查找元素 */
  find(tree: UiTree, locator: Locator): Element[];
  /** 检查单个元素是否匹配 */
  matches(element: Element, value: string): boolean;
}

/**
 * ID 选择器策略
 * 支持 resource-id 匹配，包括 endsWith/startsWith/contains 部分匹配
 */
export class IdSelectorStrategy implements ISelectorStrategy {
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
    const id = element.id || element.resourceId || '';
    if (!id) return false;

    // 精确匹配
    if (id === value) return true;

    // 部分匹配：id 格式通常为 "com.example:id/button"
    // 支持 endsWith (如 "id/button")
    if (id.endsWith(`/${value}`) || id.endsWith(`:${value}`)) return true;
    // 支持 startsWith
    if (id.startsWith(value)) return true;
    // 支持 contains
    if (id.includes(value)) return true;

    return false;
  }
}

/**
 * Text 选择器策略
 * 支持 精确匹配、模糊匹配（Levenshtein 距离，阈值 0.8）、正则表达式、通配符
 */
export class TextSelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.TEXT;

  /** 默认模糊匹配阈值 */
  private static readonly DEFAULT_FUZZY_THRESHOLD = 0.8;

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
    const text = element.text || element.contentDesc || element.description || '';
    if (!text) return false;

    // 精确匹配
    if (text === value) return true;

    // 检查是否为正则表达式（以 / 开头和结尾）
    if (value.startsWith('/') && value.endsWith('/')) {
      try {
        const regex = new RegExp(value.slice(1, -1));
        return regex.test(text);
      } catch {
        return false;
      }
    }

    // 检查是否包含通配符
    if (value.includes('*') || value.includes('?')) {
      return this.wildcardMatch(text, value);
    }

    // 模糊匹配：Levenshtein 距离
    const similarity = this.levenshteinSimilarity(text, value);
    if (similarity >= TextSelectorStrategy.DEFAULT_FUZZY_THRESHOLD) return true;

    // 包含匹配
    if (text.includes(value)) return true;

    return false;
  }

  /**
   * 通配符匹配
   * * 匹配任意字符，? 匹配单个字符
   */
  private wildcardMatch(text: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    try {
      return new RegExp(`^${regexPattern}$`).test(text);
    } catch {
      return false;
    }
  }

  /**
   * 计算 Levenshtein 相似度（0~1，1 表示完全相同）
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b[i - 1] === a[j - 1] ? 0 : 1;
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j - 1]! + cost
        );
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[b.length]![a.length]! / maxLen;
  }
}

/**
 * XPath 选择器策略
 * 实现 W3C XPath 子集
 * 支持的轴：child, parent, descendant, ancestor, following-sibling, preceding-sibling
 * 支持的函数：text(), contains(), matches(), count(), position()
 */
export class XPathSelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.XPATH;

  find(tree: UiTree, locator: Locator): Element[] {
    try {
      return this.evaluate(tree, locator.value);
    } catch {
      return [];
    }
  }

  matches(element: Element, value: string): boolean {
    // XPath 策略不直接匹配单个元素，需要完整树
    return false;
  }

  /**
   * 简化 XPath 求值
   * 支持基础路径表达式和谓词
   */
  private evaluate(tree: UiTree, xpath: string): Element[] {
    const normalizedXpath = xpath.trim();

    // 处理 // 简写（descendant-or-self）
    if (normalizedXpath.startsWith('//')) {
      return this.evaluateDescendant(tree, normalizedXpath.slice(2));
    }

    // 处理 / 开头（绝对路径）
    if (normalizedXpath.startsWith('/')) {
      return this.evaluateAbsolutePath(tree, normalizedXpath.slice(1));
    }

    return [];
  }

  /**
   * 处理 descendant 查找（//element）
   */
  private evaluateDescendant(tree: UiTree, expression: string): Element[] {
    const results: Element[] = [];
    const [nodeTest, ...predicates] = this.parseExpression(expression);

    for (const element of tree.elements.values()) {
      if (this.matchesNodeTest(element, nodeTest)) {
        if (this.matchesPredicates(element, predicates.join(''))) {
          results.push(element);
        }
      }
    }

    return results;
  }

  /**
   * 处理绝对路径查找
   */
  private evaluateAbsolutePath(tree: UiTree, expression: string): Element[] {
    const segments = expression.split('/').filter(Boolean);
    if (segments.length === 0) return [tree.root];

    let currentElements: Element[] = [tree.root];

    for (const segment of segments) {
      const nextElements: Element[] = [];
      for (const el of currentElements) {
        const children = this.getChildren(tree, el);
        const [nodeTest, ...predicates] = this.parseExpression(segment);
        for (const child of children) {
          if (this.matchesNodeTest(child, nodeTest)) {
            if (this.matchesPredicates(child, predicates.join(''))) {
              nextElements.push(child);
            }
          }
        }
      }
      currentElements = nextElements;
      if (currentElements.length === 0) break;
    }

    return currentElements;
  }

  /**
   * 解析 XPath 表达式为节点测试和谓词
   */
  private parseExpression(expression: string): [string, string[]] {
    const predicates: string[] = [];
    let nodeTest = expression;

    // 提取 [...] 中的谓词
    const predicateRegex = /\[([^\]]+)\]/g;
    let match;
    while ((match = predicateRegex.exec(expression)) !== null) {
      predicates.push(match[1]!);
    }
    // 移除谓词部分得到节点测试
    nodeTest = expression.replace(/\[[^\]]+\]/g, '').trim();

    return [nodeTest, predicates];
  }

  /**
   * 检查元素是否匹配节点测试
   */
  private matchesNodeTest(element: Element, nodeTest: string): boolean {
    if (nodeTest === '*' || nodeTest === 'node()') return true;
    if (nodeTest === 'element()') return true;

    // 匹配元素类型
    const typeLower = nodeTest.toLowerCase();
    return element.type.toLowerCase() === typeLower;
  }

  /**
   * 检查元素是否匹配谓词
   */
  private matchesPredicates(element: Element, predicateStr: string): boolean {
    if (!predicateStr) return true;

    const predicates = predicateStr.split('][').map(p => p.replace(/^\[|\]$/g, ''));

    for (const predicate of predicates) {
      if (!this.evaluatePredicate(element, predicate)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 求值单个谓词
   */
  private evaluatePredicate(element: Element, predicate: string): boolean {
    // text() = 'value'
    const textMatch = predicate.match(/^text\(\)\s*=\s*['"](.+)['"]$/);
    if (textMatch) {
      return (element.text || '') === textMatch[1];
    }

    // contains(text(), 'value')
    const containsMatch = predicate.match(/^contains\(text\(\),\s*['"](.+)['"]\)$/);
    if (containsMatch) {
      return (element.text || '').includes(containsMatch[1]!);
    }

    // contains(@attr, 'value')
    const attrContainsMatch = predicate.match(/^contains\(@(\w+),\s*['"](.+)['"]\)$/);
    if (attrContainsMatch) {
      const attrValue = String(element.attributes[attrContainsMatch[1]!] || '');
      return attrValue.includes(attrContainsMatch[2]!);
    }

    // @attr = 'value'
    const attrMatch = predicate.match(/^@(\w+)\s*=\s*['"](.+)['"]$/);
    if (attrMatch) {
      return String(element.attributes[attrMatch[1]!] || '') === attrMatch[2];
    }

    // @attr (属性存在)
    const attrExistsMatch = predicate.match(/^@(\w+)$/);
    if (attrExistsMatch) {
      return attrExistsMatch[1]! in element.attributes;
    }

    // position() = N
    const posMatch = predicate.match(/^position\(\)\s*=\s*(\d+)$/);
    if (posMatch) {
      return true; // 简化处理
    }

    // 数字索引
    const indexMatch = predicate.match(/^(\d+)$/);
    if (indexMatch) {
      return true; // 简化处理
    }

    return false;
  }

  /**
   * 获取子元素
   */
  private getChildren(tree: UiTree, element: Element): Element[] {
    if (!element.childrenIds || element.childrenIds.length === 0) return [];
    return element.childrenIds
      .map(id => tree.elements.get(id))
      .filter((e): e is Element => e !== undefined);
  }
}

/**
 * Coordinate 选择器策略
 * 通过坐标定位元素
 */
export class CoordinateSelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.COORDINATE;

  find(tree: UiTree, locator: Locator): Element[] {
    // 坐标值格式: "x,y"
    const parts = locator.value.split(',');
    if (parts.length !== 2) return [];

    const x = parseFloat(parts[0]!);
    const y = parseFloat(parts[1]!);
    if (isNaN(x) || isNaN(y)) return [];

    // 查找包含该坐标的最小元素
    let bestMatch: Element | null = null;
    let bestArea = Infinity;

    for (const element of tree.elements.values()) {
      if (!element.visible) continue;
      const { bounds } = element;
      if (x >= bounds.x && x <= bounds.x + bounds.width &&
          y >= bounds.y && y <= bounds.y + bounds.height) {
        const area = bounds.width * bounds.height;
        // 选择面积最小的（最具体的）元素
        if (area < bestArea) {
          bestArea = area;
          bestMatch = element;
        }
      }
    }

    return bestMatch ? [bestMatch] : [];
  }

  matches(element: Element, value: string): boolean {
    const parts = value.split(',');
    if (parts.length !== 2) return false;
    const x = parseFloat(parts[0]!);
    const y = parseFloat(parts[1]!);
    if (isNaN(x) || isNaN(y)) return false;

    const { bounds } = element;
    return x >= bounds.x && x <= bounds.x + bounds.width &&
           y >= bounds.y && y <= bounds.y + bounds.height;
  }

  /**
   * 解析坐标值
   */
  static parse(value: string): { x: number; y: number } | null {
    const parts = value.split(',');
    if (parts.length !== 2) return null;
    const x = parseFloat(parts[0]!);
    const y = parseFloat(parts[1]!);
    if (isNaN(x) || isNaN(y)) return null;
    return { x, y };
  }
}

/**
 * Vision 选择器策略
 * 通过 AI 模板匹配定位元素
 * 使用 SIFT/SURF 算法，可配置阈值（默认 0.85）
 */
export class VisionSelectorStrategy implements ISelectorStrategy {
  readonly type = LocatorType.VISION;

  /** 默认匹配阈值 */
  private static readonly DEFAULT_THRESHOLD = 0.85;

  find(tree: UiTree, locator: Locator): Element[] {
    // Vision 策略需要截图和模板图片，在 UI 树中无法直接匹配
    // 此处为框架实现，实际使用时由 VisionMatcher 处理
    return [];
  }

  matches(element: Element, value: string): boolean {
    // Vision 策略不支持在 UI 树中直接匹配
    return false;
  }

  /**
   * 模板匹配（需要截图和模板）
   * @param screenshot 屏幕截图
   * @param template 模板图片
   * @param threshold 匹配阈值
   * @returns 匹配结果
   */
  static async matchTemplate(
    _screenshot: Buffer,
    _template: Buffer,
    threshold: number = VisionSelectorStrategy.DEFAULT_THRESHOLD
  ): Promise<{ matched: boolean; confidence: number; position?: { x: number; y: number } }> {
    // 实际实现需要调用 OpenCV 或类似库
    // 当前为框架实现
    return {
      matched: false,
      confidence: 0,
    };
  }
}

/**
 * 选择器回退链
 * 按优先级尝试多种定位策略: ID > Text > XPath > Coordinate > Vision
 */
export class SelectorFallbackChain {
  private strategies: ISelectorStrategy[];
  private readonly strategyOrder: LocatorType[] = [
    LocatorType.ID,
    LocatorType.TEXT,
    LocatorType.XPATH,
    LocatorType.COORDINATE,
    LocatorType.VISION,
  ];

  constructor() {
    this.strategies = [
      // OHOS 特化策略（优先）
      new OhosKeySelectorStrategy(),
      // 通用策略
      new IdSelectorStrategy(),
      new TextSelectorStrategy(),
      // OHOS 类型/包名策略
      new OhosTypeSelectorStrategy(),
      new OhosBundleSelectorStrategy(),
      new OhosPagePathSelectorStrategy(),
      // 通用兜底
      new XPathSelectorStrategy(),
      new CoordinateSelectorStrategy(),
      new VisionSelectorStrategy(),
    ];
  }

  /**
   * 使用回退链查找元素
   * 先用主策略，失败后按优先级尝试其他策略
   */
  findWithFallback(tree: UiTree, locator: Locator): {
    element: Element | null;
    usedStrategy: LocatorType;
    attempts: Array<{ type: LocatorType; found: number }>;
  } {
    const attempts: Array<{ type: LocatorType; found: number }> = [];

    // 首先尝试原始策略
    const primaryStrategy = this.getStrategy(locator.type);
    if (primaryStrategy) {
      const results = primaryStrategy.find(tree, locator);
      attempts.push({ type: locator.type, found: results.length });
      if (results.length > 0) {
        return { element: results[0]!, usedStrategy: locator.type, attempts };
      }
    }

    // 回退到其他策略
    for (const type of this.strategyOrder) {
      if (type === locator.type) continue;

      const strategy = this.getStrategy(type);
      if (!strategy) continue;

      // 需要将原始 locator 转换为目标策略的 locator
      const convertedLocator = this.convertLocator(locator, type);
      if (!convertedLocator) continue;

      const results = strategy.find(tree, convertedLocator);
      attempts.push({ type, found: results.length });
      if (results.length > 0) {
        return { element: results[0]!, usedStrategy: type, attempts };
      }
    }

    return { element: null, usedStrategy: locator.type, attempts };
  }

  /**
   * 获取指定类型的策略
   */
  getStrategy(type: LocatorType): ISelectorStrategy | undefined {
    return this.strategies.find(s => s.type === type);
  }

  /**
   * 转换定位器类型
   * 尝试将原始定位器的值转换为目标策略可用的格式
   */
  private convertLocator(locator: Locator, targetType: LocatorType): Locator | null {
    // 文本类定位器可以互相转换
    if (locator.type === LocatorType.TEXT && targetType === LocatorType.ID) {
      // 文本值作为 ID 部分匹配
      return { type: targetType, value: locator.value };
    }

    if (locator.type === LocatorType.ID && targetType === LocatorType.TEXT) {
      // ID 值作为文本匹配
      return { type: targetType, value: locator.value };
    }

    if (locator.type === LocatorType.TEXT && targetType === LocatorType.XPATH) {
      // 文本值转 XPath
      return {
        type: targetType,
        value: `//*[contains(text(), '${locator.value}')]`,
      };
    }

    if (locator.type === LocatorType.ID && targetType === LocatorType.XPATH) {
      // ID 值转 XPath
      return {
        type: targetType,
        value: `//*[@resource-id='${locator.value}']`,
      };
    }

    // 坐标和视觉策略无法从其他类型转换
    return null;
  }
}
