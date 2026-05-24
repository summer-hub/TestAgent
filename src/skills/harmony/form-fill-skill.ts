import { Skill, SkillContext, SkillResult, SkillMetadata } from '../skill-base';
import { LocatorType, Element } from '@core/types/element.type';

/**
 * 字段类型
 */
export type FieldType = 'text' | 'number' | 'email' | 'phone' | 'password' | 'select' | 'checkbox' | 'radio' | 'date';

/**
 * 字段定义
 */
export interface FormField {
  /** 字段名称（用于匹配） */
  name: string;
  /** 字段标签别名 */
  aliases?: string[];
  /** 字段类型 */
  type: FieldType;
  /** 字段值 */
  value: any;
  /** 是否必填 */
  required?: boolean;
  /** 自定义选择器 */
  selector?: string;
  /** 选项（select/radio/checkbox） */
  option?: string;
}

/**
 * 表单填充参数
 */
export interface FormFillParams {
  /** 字段列表 */
  fields: FormField[];
  /** 是否自动检测字段 */
  autoDetect?: boolean;
  /** 是否在每个字段后截图 */
  captureScreenshots?: boolean;
  /** 字段匹配阈值（0-1，越大越严格） */
  matchThreshold?: number;
  /** 提交按钮文本 */
  submitButtonText?: string;
  /** 是否自动提交 */
  autoSubmit?: boolean;
}

/**
 * FormFillSkill - 表单填充技能
 * 自动字段检测、智能匹配、进度回调
 */
export class FormFillSkill extends Skill {
  readonly metadata: SkillMetadata = {
    name: 'form_fill',
    description: '智能表单填充技能，支持字段自动检测、模糊匹配、多种字段类型',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: '字段定义列表',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['text', 'number', 'email', 'phone', 'password', 'select', 'checkbox', 'radio', 'date'] },
              value: {},
              required: { type: 'boolean' },
              selector: { type: 'string' },
              option: { type: 'string' },
            },
            required: ['name', 'type', 'value'],
          },
        },
        autoDetect: { type: 'boolean', default: true },
        captureScreenshots: { type: 'boolean', default: false },
        matchThreshold: { type: 'number', minimum: 0, maximum: 1, default: 0.7 },
        submitButtonText: { type: 'string' },
        autoSubmit: { type: 'boolean', default: false },
      },
      required: ['fields'],
    },
    examples: [
      {
        description: '填写注册表单',
        params: {
          fields: [
            { name: '姓名', type: 'text', value: '张三' },
            { name: '邮箱', type: 'email', value: 'test@example.com' },
            { name: '密码', type: 'password', value: 'pass123' },
          ],
          autoSubmit: true,
          submitButtonText: '注册',
        },
      },
    ],
    tags: ['form', 'input', 'harmonyos'],
    version: '1.0.0',
  };

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    const fillParams = params as FormFillParams;
    const startTime = Date.now();
    const filledFields: string[] = [];
    const failedFields: Array<{ name: string; error: string }> = [];
    const screenshots: Buffer[] = [];

    for (const [index, field] of fillParams.fields.entries()) {
      this.reportProgress(
        context,
        index + 1,
        fillParams.fields.length,
        `填充字段：${field.name}`
      );

      try {
        await this.fillField(field, fillParams, context);
        filledFields.push(field.name);

        if (fillParams.captureScreenshots) {
          const screenshot = await context.driver.takeScreenshot();
          screenshots.push(screenshot);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        failedFields.push({ name: field.name, error: errMsg });
        if (field.required) {
          return {
            success: false,
            message: `必填字段 ${field.name} 填充失败`,
            error: errMsg,
            duration: Date.now() - startTime,
            metadata: { filledFields, failedFields },
          };
        }
      }
    }

    // 自动提交
    if (fillParams.autoSubmit) {
      const submitResult = await this.submitForm(fillParams, context);
      if (!submitResult.success) {
        return {
          ...submitResult,
          duration: Date.now() - startTime,
          metadata: { filledFields, failedFields },
        };
      }
    }

    return {
      success: failedFields.length === 0,
      message: `表单填充完成：成功 ${filledFields.length}，失败 ${failedFields.length}`,
      output: { filledFields, failedFields },
      duration: Date.now() - startTime,
      metadata: { screenshots: screenshots.length },
    };
  }

  /**
   * 填充单个字段
   */
  private async fillField(
    field: FormField,
    params: FormFillParams,
    context: SkillContext
  ): Promise<void> {
    const { driver } = context;

    // 找到字段元素
    const element = await this.findFieldElement(field, params, context);
    if (!element) {
      throw new Error(`未找到字段：${field.name}`);
    }

    switch (field.type) {
      case 'text':
      case 'number':
      case 'email':
      case 'phone':
      case 'password':
        await driver.click(element);
        await driver.clearText(element);
        await driver.inputText(element, String(field.value));
        break;

      case 'date':
        await driver.click(element);
        await this.delay(500);
        // 简化实现：直接输入日期字符串
        await driver.inputText(element, String(field.value));
        break;

      case 'checkbox':
        if (field.value) {
          await driver.click(element);
        }
        break;

      case 'radio':
        await driver.click(element);
        break;

      case 'select':
        await driver.click(element);
        await this.delay(500);
        // 选择选项
        const option = field.option || String(field.value);
        const optionEl = await driver.findElement({
          type: LocatorType.TEXT,
          value: option,
        });
        if (optionEl) {
          await driver.click(optionEl);
        } else {
          throw new Error(`未找到选项：${option}`);
        }
        break;

      default:
        throw new Error(`不支持的字段类型：${field.type}`);
    }

    // 字段间短暂等待
    await this.delay(200);
  }

  /**
   * 查找字段元素（智能匹配）
   */
  private async findFieldElement(
    field: FormField,
    params: FormFillParams,
    context: SkillContext
  ): Promise<Element | null> {
    const { driver } = context;

    // 优先使用自定义选择器
    if (field.selector) {
      return await driver.findElement({
        type: LocatorType.TEXT,
        value: field.selector,
      });
    }

    // 收集匹配候选
    const candidates: string[] = [field.name];
    if (field.aliases) candidates.push(...field.aliases);

    // 字段类型相关候选
    const typeAliases: Record<FieldType, string[]> = {
      text: [],
      number: ['数字', '数量'],
      email: ['邮箱', 'Email', 'E-mail'],
      phone: ['手机', '电话', '手机号'],
      password: ['密码', 'Password'],
      select: [],
      checkbox: [],
      radio: [],
      date: ['日期', 'Date'],
    };
    candidates.push(...typeAliases[field.type]);

    // 1. 精确匹配
    for (const candidate of candidates) {
      const el = await driver.findElement({ type: LocatorType.TEXT, value: candidate });
      if (el) return el;
    }

    // 2. 模糊匹配（构造正则）
    if (params.autoDetect !== false) {
      const pattern = candidates.map(c => this.escapeRegex(c)).join('|');
      const el = await driver.findElement({
        type: LocatorType.TEXT,
        value: pattern,
      });
      if (el) return el;
    }

    return null;
  }

  /**
   * 提交表单
   */
  private async submitForm(
    params: FormFillParams,
    context: SkillContext
  ): Promise<SkillResult> {
    const { driver } = context;
    const submitTexts = params.submitButtonText
      ? [params.submitButtonText]
      : ['提交', '确定', '保存', '完成', 'Submit', 'Save', 'OK'];

    const pattern = submitTexts.map(t => this.escapeRegex(t)).join('|');
    const button = await driver.findElement({ type: LocatorType.TEXT, value: pattern });
    if (!button) {
      return { success: false, message: '未找到提交按钮', error: 'SUBMIT_BUTTON_NOT_FOUND' };
    }

    await driver.click(button);
    await this.delay(1000);

    return { success: true, message: '表单已提交' };
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
