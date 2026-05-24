/**
 * DatasetBuilder - 数据集构建工具
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { TestCategory, TestPriority } from '@core/types/test-case.type';
import { LocatorType } from '@core/types/element.type';
import { FailureType } from '@core/interfaces/fixer.interface';
import type { EvalSample, ExpectedAction, ErrorInjection, EvalDifficulty } from './types';

/** Fluent Builder for individual EvalSamples */
export class SampleBuilder {
  private _id = '';
  private _difficulty: EvalDifficulty = 'L0';
  private _category = 'general';
  private _weight = 1;
  private _appState = 'unknown';
  private _taskDesc = '';
  private _expectedActions: ExpectedAction[] = [];
  private _testCaseSteps: string[] = [];
  private _expectedResult = '';
  private _criticalElements: string[] = [];
  private _expectedTools: string[] = [];
  private _expectedLocators: import('@core/types/element.type').Locator[] = [];
  private _expectedStatus: 'passed' | 'failed' = 'passed';
  private _forbiddenActions: string[] = [];
  private _expectedStepRange: [number, number] = [1, 20];
  private _errorInjection?: ErrorInjection;
  private _mockUiTree: any = DatasetBuilder.emptyUiTree();
  private _variables: Record<string, any> = {};
  private _expectedAssertions: Array<{ text: string; shouldPass: boolean }> = [];

  setId(v: string) { this._id = v; return this; }
  setDifficulty(v: EvalDifficulty) { this._difficulty = v; return this; }
  setCategory(v: string) { this._category = v; return this; }
  setWeight(v: number) { this._weight = v; return this; }
  setAppState(v: string) { this._appState = v; return this; }
  setTask(v: string) { this._taskDesc = v; return this; }
  setExpectedResult(v: string) { this._expectedResult = v; return this; }
  setStepRange(min: number, max: number) { this._expectedStepRange = [min, max]; return this; }
  expectFailed() { this._expectedStatus = 'failed'; return this; }

  addStep(text: string, tool: string, params?: Record<string, any>, locator?: import('@core/types/element.type').Locator) {
    this._testCaseSteps.push(text);
    this._expectedActions.push({
      order: this._expectedActions.length + 1,
      toolName: tool,
      params,
      locator,
      description: text,
    });
    this._expectedTools.push(tool);
    if (locator) this._expectedLocators.push(locator);
    return this;
  }

  addCriticalElement(el: string) { this._criticalElements.push(el); return this; }
  addForbiddenAction(a: string) { this._forbiddenActions.push(a); return this; }
  addAssertion(text: string, shouldPass: boolean) { this._expectedAssertions.push({ text, shouldPass }); return this; }
  setVariable(key: string, val: any) { this._variables[key] = val; return this; }
  setUiTree(tree: any) { this._mockUiTree = tree; return this; }

  injectError(step: number, type: FailureType, msg: string, fix?: import('@core/interfaces/fixer.interface').FixStrategy) {
    this._errorInjection = { stepIndex: step, errorType: type, errorMessage: msg, expectedFixStrategy: fix };
    return this;
  }

  build(): EvalSample {
    return {
      id: this._id,
      difficulty: this._difficulty,
      category: this._category,
      weight: this._weight,
      setup: {
        appState: this._appState,
        mockUiTree: this._mockUiTree,
        variables: this._variables,
      },
      task: {
        description: this._taskDesc,
        expectedActions: this._expectedActions,
        testCase: {
          id: this._id,
          title: this._taskDesc,
          category: TestCategory.POSITIVE,
          priority: TestPriority.P1,
          steps: this._testCaseSteps,
          expectedResult: this._expectedResult,
          tags: [this._category, this._difficulty],
        },
      },
      groundTruth: {
        expectedStatus: this._expectedStatus,
        expectedTools: this._expectedTools,
        expectedLocators: this._expectedLocators,
        criticalElements: this._criticalElements,
        forbiddenActions: this._forbiddenActions.length > 0 ? this._forbiddenActions : undefined,
        expectedStepRange: this._expectedStepRange,
        expectedAssertions: this._expectedAssertions.length > 0 ? this._expectedAssertions : undefined,
      },
      errorInjection: this._errorInjection,
    };
  }
}

/** Dataset builder utilities */
export class DatasetBuilder {
  static sample(): SampleBuilder {
    return new SampleBuilder();
  }

  static clickSample(id: string, desc: string, target: string, difficulty: EvalDifficulty = 'L0'): EvalSample {
    return new SampleBuilder()
      .setId(id).setDifficulty(difficulty).setCategory('click')
      .setAppState('home').setTask(desc).setExpectedResult(`点击"${target}"成功`)
      .addStep(`点击"${target}"`, 'click', { locator: { type: LocatorType.TEXT, value: target } }, { type: LocatorType.TEXT, value: target })
      .addCriticalElement(target)
      .build();
  }

  static inputSample(id: string, desc: string, field: string, value: string, difficulty: EvalDifficulty = 'L0'): EvalSample {
    return new SampleBuilder()
      .setId(id).setDifficulty(difficulty).setCategory('input')
      .setAppState('form_page').setTask(desc).setExpectedResult(`在"${field}"输入"${value}"`)
      .addStep(`在"${field}"输入"${value}"`, 'input_text', { text: value, locator: { type: LocatorType.TEXT, value: field } }, { type: LocatorType.TEXT, value: field })
      .addCriticalElement(field)
      .build();
  }

  static assertSample(id: string, desc: string, text: string, shouldPass = true, difficulty: EvalDifficulty = 'L0'): EvalSample {
    const b = new SampleBuilder()
      .setId(id).setDifficulty(difficulty).setCategory('assert')
      .setAppState('result_page').setTask(desc)
      .setExpectedResult(shouldPass ? `页面含"${text}"` : `页面不含"${text}"`)
      .addStep(`验证${shouldPass ? '存在' : '不存在'}"${text}"`, 'text_exists', { text }, { type: LocatorType.TEXT, value: text })
      .addAssertion(text, shouldPass)
      .addCriticalElement(text);
    if (!shouldPass) b.expectFailed();
    return b.build();
  }

  static fixSample(id: string, desc: string, errorType: FailureType, errorMsg: string, difficulty: EvalDifficulty = 'L3'): EvalSample {
    return new SampleBuilder()
      .setId(id).setDifficulty(difficulty).setCategory('fix')
      .setAppState('home').setTask(desc).setExpectedResult('自愈恢复后成功')
      .addStep(`执行: ${desc}`, 'click', { locator: { type: LocatorType.TEXT, value: 'target' } }, { type: LocatorType.TEXT, value: 'target' })
      .addCriticalElement('target')
      .injectError(1, errorType, errorMsg)
      .build();
  }

  static emptyUiTree(): import('@core/types/element.type').UiTree {
    return {
      root: {
        id: 'root', type: 'Page', text: '',
        bounds: { x: 0, y: 0, width: 1080, height: 2340 },
        center: { x: 540, y: 1170 },
        visible: true, clickable: false, enabled: true, level: 0, attributes: {},
      },
      elements: new Map(),
      totalCount: 1, visibleCount: 1,
      screenSize: { width: 1080, height: 2340 },
      packageName: 'com.example.app', activityName: 'MainAbility', timestamp: Date.now(),
    };
  }

  static loginPageUiTree(): import('@core/types/element.type').UiTree {
    const tree = this.emptyUiTree();
    const u: import('@core/types/element.type').Element = {
      id: 'el-user', type: 'TextInput', text: '请输入用户名',
      bounds: { x: 100, y: 400, width: 880, height: 100 }, center: { x: 540, y: 450 },
      visible: true, clickable: true, enabled: true, level: 1, parentId: 'root',
      attributes: { hint: '用户名/手机号/邮箱' },
    };
    const p: import('@core/types/element.type').Element = {
      id: 'el-pass', type: 'TextInput', text: '请输入密码',
      bounds: { x: 100, y: 530, width: 880, height: 100 }, center: { x: 540, y: 580 },
      visible: true, clickable: true, enabled: true, level: 1, parentId: 'root',
      attributes: { hint: '密码' },
    };
    const btn: import('@core/types/element.type').Element = {
      id: 'el-btn', type: 'Button', text: '登录',
      bounds: { x: 100, y: 680, width: 880, height: 100 }, center: { x: 540, y: 730 },
      visible: true, clickable: true, enabled: true, level: 1, parentId: 'root',
      attributes: { color: '#007AFF' },
    };
    for (const el of [u, p, btn]) tree.elements.set(el.id, el);
    tree.root.childrenIds = [u.id, p.id, btn.id];
    tree.totalCount = 4; tree.visibleCount = 4;
    return tree;
  }

  static async loadFromFile(filePath: string): Promise<EvalSample[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const d = JSON.parse(content);
    if (Array.isArray(d)) return d;
    if (d.samples) return d.samples;
    if (d.dataset) return d.dataset;
    throw new Error(`Invalid format: ${filePath}`);
  }

  static async loadDirectory(dirPath: string): Promise<EvalSample[]> {
    const out: EvalSample[] = [];
    for (const entry of await fs.readdir(dirPath, { withFileTypes: true })) {
      const fp = path.join(dirPath, entry.name);
      if (entry.isDirectory()) out.push(...await this.loadDirectory(fp));
      else if (entry.name.endsWith('.json')) out.push(...await this.loadFromFile(fp));
    }
    return out;
  }

  static async saveToFile(samples: EvalSample[], filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath,
      JSON.stringify({ version: 1, generatedAt: Date.now(), totalSamples: samples.length, samples }, null, 2),
      'utf-8');
  }
}
