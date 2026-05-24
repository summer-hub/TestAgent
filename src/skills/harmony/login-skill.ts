import { Skill, SkillContext, SkillResult, SkillMetadata } from '../skill-base';
import { LocatorType } from '@core/types/element.type';

/**
 * 登录类型
 */
export type LoginType = 'account' | 'phone' | 'third_party';

/**
 * 第三方登录平台
 */
export type ThirdPartyPlatform = 'wechat' | 'qq' | 'weibo' | 'huawei' | 'apple';

/**
 * 登录参数
 */
export interface LoginParams {
  /** 登录类型 */
  loginType: LoginType;
  /** 用户名 / 手机号 / 邮箱 */
  username?: string;
  /** 密码 */
  password?: string;
  /** 验证码（手机登录） */
  verifyCode?: string;
  /** 第三方平台 */
  platform?: ThirdPartyPlatform;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 是否自动等待验证码 */
  autoWaitVerifyCode?: boolean;
  /** 验证码等待超时 */
  verifyCodeTimeout?: number;
  /** 自定义元素定位 */
  selectors?: {
    usernameField?: string;
    passwordField?: string;
    verifyCodeField?: string;
    loginButton?: string;
    sendVerifyCodeButton?: string;
    successIndicator?: string;
  };
}

/**
 * LoginSkill - 登录技能
 * 支持账号、手机、第三方登录及重试
 */
export class LoginSkill extends Skill {
  readonly metadata: SkillMetadata = {
    name: 'login',
    description: 'HarmonyOS 应用登录技能，支持账号密码、手机验证码、第三方登录',
    parameters: {
      type: 'object',
      properties: {
        loginType: {
          type: 'string',
          enum: ['account', 'phone', 'third_party'],
          description: '登录类型',
        },
        username: { type: 'string', description: '用户名/手机号/邮箱' },
        password: { type: 'string', description: '密码' },
        verifyCode: { type: 'string', description: '验证码' },
        platform: {
          type: 'string',
          enum: ['wechat', 'qq', 'weibo', 'huawei', 'apple'],
          description: '第三方平台',
        },
        maxRetries: { type: 'number', description: '最大重试次数', default: 3 },
        autoWaitVerifyCode: { type: 'boolean', description: '是否自动等待验证码' },
        verifyCodeTimeout: { type: 'number', description: '验证码等待超时（毫秒）' },
        selectors: { type: 'object', description: '自定义元素定位' },
      },
      required: ['loginType'],
    },
    examples: [
      {
        description: '账号密码登录',
        params: { loginType: 'account', username: 'test@example.com', password: 'pass123' },
      },
      {
        description: '手机验证码登录',
        params: { loginType: 'phone', username: '13800000000', autoWaitVerifyCode: true },
      },
      {
        description: '微信登录',
        params: { loginType: 'third_party', platform: 'wechat' },
      },
    ],
    tags: ['login', 'auth', 'harmonyos'],
    version: '1.0.0',
  };

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    const loginParams = params as LoginParams;
    const maxRetries = loginParams.maxRetries ?? 3;
    const startTime = Date.now();

    let lastError: string | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.reportProgress(context, attempt, maxRetries, `第 ${attempt} 次登录尝试`);

      try {
        let result: SkillResult;
        switch (loginParams.loginType) {
          case 'account':
            result = await this.loginByAccount(loginParams, context);
            break;
          case 'phone':
            result = await this.loginByPhone(loginParams, context);
            break;
          case 'third_party':
            result = await this.loginByThirdParty(loginParams, context);
            break;
          default:
            return {
              success: false,
              message: `Unsupported login type: ${loginParams.loginType}`,
              error: 'UNSUPPORTED_LOGIN_TYPE',
            };
        }

        if (result.success) {
          return { ...result, duration: Date.now() - startTime };
        }
        lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // 重试前等待
      if (attempt < maxRetries) {
        await this.delay(1000 * attempt);
      }
    }

    return {
      success: false,
      message: `登录失败，已尝试 ${maxRetries} 次`,
      error: lastError,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 账号密码登录
   */
  private async loginByAccount(params: LoginParams, context: SkillContext): Promise<SkillResult> {
    if (!params.username || !params.password) {
      return {
        success: false,
        message: '账号登录需要 username 和 password',
        error: 'MISSING_CREDENTIALS',
      };
    }

    const { driver } = context;
    const selectors = params.selectors || {};

    // 填充用户名
    const usernameLocator = {
      type: LocatorType.TEXT,
      value: selectors.usernameField || '账号|用户名|手机号|邮箱',
    };
    const usernameField = await driver.findElement(usernameLocator);
    if (!usernameField) {
      return { success: false, message: '未找到用户名输入框', error: 'USERNAME_FIELD_NOT_FOUND' };
    }
    await driver.click(usernameField);
    await driver.clearText(usernameField);
    await driver.inputText(usernameField, params.username);

    // 填充密码
    const passwordLocator = {
      type: LocatorType.TEXT,
      value: selectors.passwordField || '密码',
    };
    const passwordField = await driver.findElement(passwordLocator);
    if (!passwordField) {
      return { success: false, message: '未找到密码输入框', error: 'PASSWORD_FIELD_NOT_FOUND' };
    }
    await driver.click(passwordField);
    await driver.clearText(passwordField);
    await driver.inputText(passwordField, params.password);

    // 点击登录
    const loginLocator = {
      type: LocatorType.TEXT,
      value: selectors.loginButton || '登录|登 录|Sign In|Login',
    };
    const loginButton = await driver.findElement(loginLocator);
    if (!loginButton) {
      return { success: false, message: '未找到登录按钮', error: 'LOGIN_BUTTON_NOT_FOUND' };
    }
    await driver.click(loginButton);

    // 等待登录结果
    return await this.waitForLoginResult(params, context);
  }

  /**
   * 手机验证码登录
   */
  private async loginByPhone(params: LoginParams, context: SkillContext): Promise<SkillResult> {
    if (!params.username) {
      return { success: false, message: '手机登录需要 username（手机号）', error: 'MISSING_PHONE' };
    }

    const { driver } = context;
    const selectors = params.selectors || {};

    // 填充手机号
    const phoneLocator = {
      type: LocatorType.TEXT,
      value: selectors.usernameField || '手机号|请输入手机号',
    };
    const phoneField = await driver.findElement(phoneLocator);
    if (!phoneField) {
      return { success: false, message: '未找到手机号输入框', error: 'PHONE_FIELD_NOT_FOUND' };
    }
    await driver.click(phoneField);
    await driver.clearText(phoneField);
    await driver.inputText(phoneField, params.username);

    // 发送验证码
    const sendCodeLocator = {
      type: LocatorType.TEXT,
      value: selectors.sendVerifyCodeButton || '发送验证码|获取验证码',
    };
    const sendCodeButton = await driver.findElement(sendCodeLocator);
    if (!sendCodeButton) {
      return {
        success: false,
        message: '未找到发送验证码按钮',
        error: 'SEND_CODE_BUTTON_NOT_FOUND',
      };
    }
    await driver.click(sendCodeButton);

    // 等待并填充验证码
    let verifyCode = params.verifyCode;
    if (!verifyCode && params.autoWaitVerifyCode) {
      const timeout = params.verifyCodeTimeout ?? 60000;
      verifyCode = await this.waitForVerifyCode(context, timeout);
    }

    if (!verifyCode) {
      return { success: false, message: '未获取到验证码', error: 'NO_VERIFY_CODE' };
    }

    const codeLocator = {
      type: LocatorType.TEXT,
      value: selectors.verifyCodeField || '验证码|请输入验证码',
    };
    const codeField = await driver.findElement(codeLocator);
    if (!codeField) {
      return { success: false, message: '未找到验证码输入框', error: 'CODE_FIELD_NOT_FOUND' };
    }
    await driver.click(codeField);
    await driver.clearText(codeField);
    await driver.inputText(codeField, verifyCode);

    // 点击登录
    const loginLocator = {
      type: LocatorType.TEXT,
      value: selectors.loginButton || '登录|确定|提交',
    };
    const loginButton = await driver.findElement(loginLocator);
    if (loginButton) {
      await driver.click(loginButton);
    }

    return await this.waitForLoginResult(params, context);
  }

  /**
   * 第三方登录
   */
  private async loginByThirdParty(
    params: LoginParams,
    context: SkillContext
  ): Promise<SkillResult> {
    if (!params.platform) {
      return {
        success: false,
        message: '第三方登录需要 platform',
        error: 'MISSING_PLATFORM',
      };
    }

    const { driver } = context;
    const platformText: Record<ThirdPartyPlatform, string> = {
      wechat: '微信|WeChat',
      qq: 'QQ',
      weibo: '微博|Weibo',
      huawei: '华为|HUAWEI ID',
      apple: 'Apple',
    };

    const locator = {
      type: LocatorType.TEXT,
      value: platformText[params.platform],
    };
    const button = await driver.findElement(locator);
    if (!button) {
      return {
        success: false,
        message: `未找到 ${params.platform} 登录入口`,
        error: 'PLATFORM_BUTTON_NOT_FOUND',
      };
    }
    await driver.click(button);

    // 等待跳转和授权
    await this.delay(3000);

    // 尝试点击授权按钮
    const authLocator = {
      type: LocatorType.TEXT,
      value: '同意|允许|授权|确认',
    };
    const authButton = await driver.findElement(authLocator);
    if (authButton) {
      await driver.click(authButton);
    }

    return await this.waitForLoginResult(params, context);
  }

  /**
   * 等待登录结果
   */
  private async waitForLoginResult(
    params: LoginParams,
    context: SkillContext
  ): Promise<SkillResult> {
    const { driver } = context;
    const selectors = params.selectors || {};
    const timeout = 10000;

    // 等待成功标识
    if (selectors.successIndicator) {
      try {
        await driver.waitForElement(
          { type: LocatorType.TEXT, value: selectors.successIndicator },
          timeout
        );
        return { success: true, message: '登录成功' };
      } catch {
        return { success: false, message: '未检测到登录成功标识', error: 'LOGIN_TIMEOUT' };
      }
    }

    // 通用判断：等待登录按钮消失
    await this.delay(2000);
    const stillOnLogin = await driver.findElement({
      type: LocatorType.TEXT,
      value: '登录|登 录|Sign In|Login',
    });

    // 检查错误提示
    const errorMessages = ['密码错误', '账号错误', '验证码错误', '登录失败', '账号不存在'];
    for (const errMsg of errorMessages) {
      const errorEl = await driver.findElement({ type: LocatorType.TEXT, value: errMsg });
      if (errorEl) {
        return { success: false, message: errMsg, error: 'LOGIN_REJECTED' };
      }
    }

    if (!stillOnLogin) {
      return { success: true, message: '登录成功' };
    }

    return { success: false, message: '登录状态不确定', error: 'LOGIN_INDETERMINATE' };
  }

  /**
   * 等待验证码（从变量或外部源）
   */
  private async waitForVerifyCode(
    context: SkillContext,
    timeout: number
  ): Promise<string | undefined> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeout) {
      const code = context.variables?.['verifyCode'];
      if (code) return String(code);
      await this.delay(pollInterval);
    }

    return undefined;
  }
}
