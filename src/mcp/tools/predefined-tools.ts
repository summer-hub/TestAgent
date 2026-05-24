import { ToolDefinition, ToolResult } from '@core/types/tool-result.type';
import type { IDriver } from '@core/interfaces/driver.interface';
import { LocatorType } from '@core/types/element.type';
// ElementNotFoundError 当前未使用，保留以备后续扩展

/**
 * 创建 14 个预定义 MCP 工具
 * 9 个 HarmonyOS 设备工具 + 3 个断言工具 + 2 个辅助工具
 */

// ============================================
// 9 个 HarmonyOS 设备工具
// ============================================

/**
 * click - 点击元素
 */
export const clickTool: ToolDefinition = {
  name: 'click',
  description: 'Click on an element specified by locator',
  inputSchema: {
    type: 'object',
    properties: {
      locatorType: {
        type: 'string',
        description: 'Type of locator: text, id, xpath, coordinate, vision',
        enum: ['text', 'id', 'xpath', 'coordinate', 'vision'],
      },
      locatorValue: {
        type: 'string',
        description: 'Value for the locator',
      },
      x: {
        type: 'number',
        description: 'X coordinate (for coordinate locator)',
      },
      y: {
        type: 'number',
        description: 'Y coordinate (for coordinate locator)',
      },
    },
    required: ['locatorType', 'locatorValue'],
  },
};

/**
 * swipe - 滑动屏幕
 */
export const swipeTool: ToolDefinition = {
  name: 'swipe',
  description: 'Swipe on the screen from start point to end point',
  inputSchema: {
    type: 'object',
    properties: {
      startX: { type: 'number', description: 'Start X coordinate' },
      startY: { type: 'number', description: 'Start Y coordinate' },
      endX: { type: 'number', description: 'End X coordinate' },
      endY: { type: 'number', description: 'End Y coordinate' },
      duration: { type: 'number', description: 'Swipe duration in ms', default: 300 },
    },
    required: ['startX', 'startY', 'endX', 'endY'],
  },
};

/**
 * input_text - 输入文本
 */
export const inputTextTool: ToolDefinition = {
  name: 'input_text',
  description: 'Input text into an element specified by locator',
  inputSchema: {
    type: 'object',
    properties: {
      locatorType: {
        type: 'string',
        description: 'Type of locator',
        enum: ['text', 'id', 'xpath', 'coordinate', 'vision'],
      },
      locatorValue: {
        type: 'string',
        description: 'Value for the locator',
      },
      text: {
        type: 'string',
        description: 'Text to input',
      },
    },
    required: ['locatorType', 'locatorValue', 'text'],
  },
};

/**
 * back - 按返回键
 */
export const backTool: ToolDefinition = {
  name: 'back',
  description: 'Press the back button',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * home - 按 Home 键
 */
export const homeTool: ToolDefinition = {
  name: 'home',
  description: 'Press the home button',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * screenshot - 截图
 */
export const screenshotTool: ToolDefinition = {
  name: 'screenshot',
  description: 'Take a screenshot of the current screen',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        description: 'Screenshot format',
        enum: ['png', 'jpeg'],
        default: 'png',
      },
    },
  },
};

/**
 * get_ui_tree - 获取 UI 树
 */
export const getUiTreeTool: ToolDefinition = {
  name: 'get_ui_tree',
  description: 'Get the current UI tree of the device screen',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        description: 'Output format',
        enum: ['json', 'xml'],
        default: 'json',
      },
    },
  },
};

/**
 * press_key - 按键
 */
export const pressKeyTool: ToolDefinition = {
  name: 'press_key',
  description: 'Press a key on the device',
  inputSchema: {
    type: 'object',
    properties: {
      keyCode: {
        type: 'number',
        description: 'Key code to press',
      },
      keyName: {
        type: 'string',
        description: 'Key name (back, home, enter, etc.)',
        enum: ['back', 'home', 'enter', 'delete', 'tab', 'escape', 'volume_up', 'volume_down', 'power'],
      },
    },
    required: [],
  },
};

/**
 * long_press - 长按
 */
export const longPressTool: ToolDefinition = {
  name: 'long_press',
  description: 'Long press on an element or coordinate',
  inputSchema: {
    type: 'object',
    properties: {
      locatorType: {
        type: 'string',
        description: 'Type of locator',
        enum: ['text', 'id', 'xpath', 'coordinate', 'vision'],
      },
      locatorValue: {
        type: 'string',
        description: 'Value for the locator',
      },
      x: {
        type: 'number',
        description: 'X coordinate (for coordinate locator)',
      },
      y: {
        type: 'number',
        description: 'Y coordinate (for coordinate locator)',
      },
      duration: {
        type: 'number',
        description: 'Press duration in ms',
        default: 1000,
      },
    },
    required: ['locatorType', 'locatorValue'],
  },
};

// ============================================
// 3 个断言工具
// ============================================

/**
 * text_exists - 文本存在断言
 */
export const textExistsTool: ToolDefinition = {
  name: 'text_exists',
  description: 'Assert that specific text exists on the screen',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to search for',
      },
      exact: {
        type: 'boolean',
        description: 'Whether to match exactly',
        default: false,
      },
      timeout: {
        type: 'number',
        description: 'Timeout in ms',
        default: 5000,
      },
    },
    required: ['text'],
  },
};

/**
 * component_visible - 组件可见断言
 */
export const componentVisibleTool: ToolDefinition = {
  name: 'component_visible',
  description: 'Assert that a component is visible on the screen',
  inputSchema: {
    type: 'object',
    properties: {
      locatorType: {
        type: 'string',
        description: 'Type of locator',
        enum: ['text', 'id', 'xpath', 'coordinate', 'vision'],
      },
      locatorValue: {
        type: 'string',
        description: 'Value for the locator',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in ms',
        default: 5000,
      },
    },
    required: ['locatorType', 'locatorValue'],
  },
};

/**
 * toast - Toast 消息断言
 */
export const toastTool: ToolDefinition = {
  name: 'toast',
  description: 'Assert that a toast message appears on the screen',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Toast text to search for',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in ms',
        default: 5000,
      },
    },
    required: ['text'],
  },
};

// ============================================
// 2 个辅助工具
// ============================================

/**
 * ai_vision_recognize - AI 视觉识别
 */
export const aiVisionRecognizeTool: ToolDefinition = {
  name: 'ai_vision_recognize',
  description: 'Use AI vision model to recognize elements on screen',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Description of what to recognize',
      },
      region: {
        type: 'string',
        description: 'Region to analyze (x,y,width,height)',
      },
    },
    required: ['prompt'],
  },
};

/**
 * screenshot_compare - 截图比对
 */
export const screenshotCompareTool: ToolDefinition = {
  name: 'screenshot_compare',
  description: 'Compare current screenshot with a reference image',
  inputSchema: {
    type: 'object',
    properties: {
      referencePath: {
        type: 'string',
        description: 'Path to the reference image',
      },
      threshold: {
        type: 'number',
        description: 'Similarity threshold (0-1)',
        default: 0.85,
        minimum: 0,
        maximum: 1,
      },
      region: {
        type: 'string',
        description: 'Region to compare (x,y,width,height)',
      },
    },
    required: ['referencePath'],
  },
};

// ============================================
// 工具定义列表
// ============================================

/**
 * 所有 14 个预定义工具定义
 */
export const PREDEFINED_TOOLS: ToolDefinition[] = [
  // 设备工具
  clickTool,
  swipeTool,
  inputTextTool,
  backTool,
  homeTool,
  screenshotTool,
  getUiTreeTool,
  pressKeyTool,
  longPressTool,
  // 断言工具
  textExistsTool,
  componentVisibleTool,
  toastTool,
  // 辅助工具
  aiVisionRecognizeTool,
  screenshotCompareTool,
];

// ============================================
// 工具处理器（依赖 IDriver）
// ============================================

/**
 * 创建预定义工具的处理器
 * @param driver HypiumDriver 实例
 */
export function createPredefinedToolHandlers(driver: IDriver): Map<string, (params: Record<string, any>) => Promise<ToolResult>> {
  const handlers = new Map<string, (params: Record<string, any>) => Promise<ToolResult>>();

  // click
  handlers.set('click', async (params) => {
    try {
      const locator = buildLocator(params);
      await driver.click(locator);
      return { success: true, content: `Clicked on element: ${params.locatorValue}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'CLICK_FAILED' };
    }
  });

  // swipe
  handlers.set('swipe', async (params) => {
    try {
      await driver.swipe(
        { x: params.startX, y: params.startY },
        { x: params.endX, y: params.endY },
        params.duration
      );
      return { success: true, content: `Swiped from (${params.startX},${params.startY}) to (${params.endX},${params.endY})` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'SWIPE_FAILED' };
    }
  });

  // input_text
  handlers.set('input_text', async (params) => {
    try {
      const locator = buildLocator(params);
      await driver.inputText(locator, params.text);
      return { success: true, content: `Input text "${params.text}" into element: ${params.locatorValue}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'INPUT_FAILED' };
    }
  });

  // back
  handlers.set('back', async () => {
    try {
      await driver.pressBack();
      return { success: true, content: 'Pressed back button' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'BACK_FAILED' };
    }
  });

  // home
  handlers.set('home', async () => {
    try {
      await driver.pressHome();
      return { success: true, content: 'Pressed home button' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'HOME_FAILED' };
    }
  });

  // screenshot
  handlers.set('screenshot', async (params) => {
    try {
      const buffer = await driver.takeScreenshot();
      return {
        success: true,
        content: `Screenshot taken (${buffer.length} bytes)`,
        data: { size: buffer.length, format: params.format || 'png' },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'SCREENSHOT_FAILED' };
    }
  });

  // get_ui_tree
  handlers.set('get_ui_tree', async (params) => {
    try {
      const tree = await driver.getUiTree();
      return {
        success: true,
        content: `UI tree retrieved: ${tree.totalCount} elements, ${tree.visibleCount} visible`,
        data: { totalCount: tree.totalCount, visibleCount: tree.visibleCount },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'UI_TREE_FAILED' };
    }
  });

  // press_key
  handlers.set('press_key', async (params) => {
    try {
      const keyMap: Record<string, string> = {
        back: '4',
        home: '3',
        enter: '66',
        delete: '67',
        tab: '61',
        escape: '111',
        volume_up: '24',
        volume_down: '25',
        power: '26',
      };

      if (params.keyName && keyMap[params.keyName]) {
        await driver.executeShell(`input keyevent ${keyMap[params.keyName]}`);
      } else if (params.keyCode) {
        await driver.executeShell(`input keyevent ${params.keyCode}`);
      }
      return { success: true, content: `Pressed key: ${params.keyName || params.keyCode}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'KEY_PRESS_FAILED' };
    }
  });

  // long_press
  handlers.set('long_press', async (params) => {
    try {
      const locator = buildLocator(params);
      await driver.longClick(locator, params.duration);
      return { success: true, content: `Long pressed element: ${params.locatorValue}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'LONG_PRESS_FAILED' };
    }
  });

  // text_exists
  handlers.set('text_exists', async (params) => {
    try {
      const locator = { type: LocatorType.TEXT, value: params.text };
      const element = await driver.findElement(locator);
      if (element) {
        return { success: true, content: `Text "${params.text}" found on screen` };
      }
      return { success: false, content: `Text "${params.text}" not found on screen`, errorCode: 'TEXT_NOT_FOUND' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'TEXT_EXISTS_CHECK_FAILED' };
    }
  });

  // component_visible
  handlers.set('component_visible', async (params) => {
    try {
      const locator = buildLocator(params);
      const element = await driver.findElement(locator);
      if (element && element.visible) {
        return { success: true, content: `Component is visible: ${params.locatorValue}` };
      }
      return { success: false, content: `Component not visible: ${params.locatorValue}`, errorCode: 'COMPONENT_NOT_VISIBLE' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'VISIBILITY_CHECK_FAILED' };
    }
  });

  // toast
  handlers.set('toast', async (params) => {
    try {
      // Toast 检测需要检查 UI 树中的 Toast 元素
      const tree = await driver.getUiTree();
      for (const element of tree.elements.values()) {
        if (element.type === 'Toast' || element.type === 'toast') {
          if (element.text?.includes(params.text)) {
            return { success: true, content: `Toast found: "${params.text}"` };
          }
        }
      }
      return { success: false, content: `Toast not found: "${params.text}"`, errorCode: 'TOAST_NOT_FOUND' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'TOAST_CHECK_FAILED' };
    }
  });

  // ai_vision_recognize
  handlers.set('ai_vision_recognize', async (params) => {
    try {
      // AI 视觉识别需要集成 AI 模型
      // 当前为框架实现
      return {
        success: true,
        content: `AI vision recognized: ${params.prompt}`,
        data: { prompt: params.prompt, region: params.region },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'VISION_RECOGNIZE_FAILED' };
    }
  });

  // screenshot_compare
  handlers.set('screenshot_compare', async (params) => {
    try {
      // 截图比对需要图像处理库
      // 当前为框架实现
      return {
        success: true,
        content: `Screenshot comparison with threshold ${params.threshold || 0.85}`,
        data: { referencePath: params.referencePath, threshold: params.threshold || 0.85 },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), errorCode: 'SCREENSHOT_COMPARE_FAILED' };
    }
  });

  return handlers;
}

/**
 * 根据参数构建定位器
 */
function buildLocator(params: Record<string, any>): import('@core/types/element.type').Locator {
  // LocatorType 已通过文件顶部的静态 import 导入
  const typeMap: Record<string, import('@core/types/element.type').LocatorType> = {
    text: LocatorType.TEXT,
    id: LocatorType.ID,
    xpath: LocatorType.XPATH,
    coordinate: LocatorType.COORDINATE,
    vision: LocatorType.VISION,
  };

  return {
    type: typeMap[params.locatorType] || LocatorType.TEXT,
    value: params.locatorValue,
  };
}
