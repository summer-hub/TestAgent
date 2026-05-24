/**
 * 种子数据集 — 20 条评测样本 (L0-L3)
 */

import { DatasetBuilder } from './dataset-builder';
import { FailureType } from '@core/interfaces/fixer.interface';
import type { EvalSample } from './types';

export function buildSeedDataset(): EvalSample[] {
  const s: EvalSample[] = [];
  const loginTree = DatasetBuilder.loginPageUiTree();

  // ==========================================================
  // L0 — 基础原子操作（6 条）
  // ==========================================================
  s.push(
    DatasetBuilder.clickSample('L0-click-001', '点击登录按钮', '登录'),
    DatasetBuilder.clickSample('L0-click-002', '点击返回按钮', '返回'),
    DatasetBuilder.inputSample('L0-input-001', '输入邮箱', '用户名', 'test@example.com'),
    DatasetBuilder.inputSample('L0-input-002', '输入密码', '密码', 'MyPass@123'),
    DatasetBuilder.assertSample('L0-assert-001', '验证"欢迎"存在', '欢迎', true),
    DatasetBuilder.assertSample('L0-assert-002', '验证"错误"不存在', '错误', false),
  );

  // ==========================================================
  // L1 — 单页面场景（6 条）
  // ==========================================================
  s.push(
    DatasetBuilder.sample()
      .setId('L1-login-001').setDifficulty('L1').setCategory('login')
      .setAppState('login_page').setTask('用 test@example.com / MyPass@123 登录').setExpectedResult('登录成功')
      .setUiTree(loginTree)
      .addStep('点击用户名输入框', 'click', undefined, { type: 'text' as any, value: '用户名' })
      .addStep('输入用户名', 'input_text', { text: 'test@example.com' }, { type: 'text' as any, value: '用户名' })
      .addStep('点击密码输入框', 'click', undefined, { type: 'text' as any, value: '密码' })
      .addStep('输入密码', 'input_text', { text: 'MyPass@123' }, { type: 'text' as any, value: '密码' })
      .addStep('点击登录按钮', 'click', undefined, { type: 'text' as any, value: '登录' })
      .addStep('验证登录成功', 'text_exists', { text: '登录成功' }, { type: 'text' as any, value: '登录成功' })
      .addCriticalElement('用户名').addCriticalElement('密码').addCriticalElement('登录')
      .setStepRange(4, 10).build(),

    DatasetBuilder.sample()
      .setId('L1-login-002').setDifficulty('L1').setCategory('login')
      .setAppState('login_page').setTask('手机号 13800000000 + 验证码 654321 登录').setExpectedResult('登录成功')
      .setUiTree(loginTree)
      .addStep('切换到手机号登录', 'click', undefined, { type: 'text' as any, value: '手机号登录' })
      .addStep('输入手机号', 'input_text', { text: '13800000000' }, { type: 'text' as any, value: '手机号' })
      .addStep('点击发送验证码', 'click', undefined, { type: 'text' as any, value: '发送验证码' })
      .addStep('输入验证码', 'input_text', { text: '654321' }, { type: 'text' as any, value: '验证码' })
      .addStep('点击登录', 'click', undefined, { type: 'text' as any, value: '登录' })
      .setVariable('verifyCode', '654321').setStepRange(5, 12).build(),

    DatasetBuilder.sample()
      .setId('L1-form-001').setDifficulty('L1').setCategory('form')
      .setAppState('register_page').setTask('填写注册表单').setExpectedResult('表单完整，可提交')
      .addStep('填写姓名', 'input_text', { text: '张三' }, { type: 'text' as any, value: '姓名' })
      .addStep('填写邮箱', 'input_text', { text: 'test@test.com' }, { type: 'text' as any, value: '邮箱' })
      .addStep('填写手机号', 'input_text', { text: '13800001111' }, { type: 'text' as any, value: '手机号' })
      .addStep('勾选同意协议', 'click', undefined, { type: 'text' as any, value: '同意协议' })
      .setStepRange(4, 10).build(),

    DatasetBuilder.sample()
      .setId('L1-nav-001').setDifficulty('L1').setCategory('navigation')
      .setAppState('home').setTask('导航到设置→通用→关于').setExpectedResult('显示关于页面')
      .addStep('点击设置', 'click', undefined, { type: 'text' as any, value: '设置' })
      .addStep('点击通用', 'click', undefined, { type: 'text' as any, value: '通用' })
      .addStep('点击关于', 'click', undefined, { type: 'text' as any, value: '关于' })
      .setStepRange(3, 8).build(),

    DatasetBuilder.sample()
      .setId('L1-scroll-001').setDifficulty('L1').setCategory('scroll')
      .setAppState('list_page').setTask('向下滚动找到"隐私政策"').setExpectedResult('显示"隐私政策"')
      .addStep('向下滚动', 'swipe', { direction: 'down', start: { x: 540, y: 1600 }, end: { x: 540, y: 400 } })
      .addStep('验证出现', 'text_exists', { text: '隐私政策' })
      .addCriticalElement('隐私政策').setStepRange(2, 15).build(),

    DatasetBuilder.sample()
      .setId('L1-screenshot-001').setDifficulty('L1').setCategory('screenshot')
      .setAppState('any').setTask('截图并保存').setExpectedResult('截图成功')
      .addStep('全屏截图', 'screenshot', { mode: 'full' })
      .setStepRange(1, 3).build(),
  );

  // ==========================================================
  // L2 — 多步骤业务流程（4 条）
  // ==========================================================
  s.push(
    DatasetBuilder.sample()
      .setId('L2-e2e-login-001').setDifficulty('L2').setCategory('e2e')
      .setAppState('app_launch').setTask('首次启动→登录→验证主页').setExpectedResult('登录成功，看到主页')
      .addStep('等待加载', 'wait', { duration: 2000 })
      .addStep('输入用户名', 'input_text', { text: 'admin@test.com' }, { type: 'text' as any, value: '用户名' })
      .addStep('输入密码', 'input_text', { text: 'Admin@123' }, { type: 'text' as any, value: '密码' })
      .addStep('点击登录', 'click', undefined, { type: 'text' as any, value: '登录' })
      .addStep('等待跳转', 'wait', { duration: 3000 })
      .addStep('验证主页元素', 'text_exists', { text: '首页' })
      .addStep('验证用户名', 'text_exists', { text: 'admin' })
      .addCriticalElement('用户名').addCriticalElement('密码').addCriticalElement('登录').addCriticalElement('首页')
      .setStepRange(6, 15).build(),

    DatasetBuilder.sample()
      .setId('L2-e2e-shopping-001').setDifficulty('L2').setCategory('e2e')
      .setAppState('shop_page').setTask('浏览商品→详情→加入购物车→验证').setExpectedResult('购物车含目标商品')
      .addStep('点击商品卡片', 'click', undefined, { type: 'text' as any, value: '商品名称' })
      .addStep('等待详情', 'wait', { duration: 1000 })
      .addStep('加入购物车', 'click', undefined, { type: 'text' as any, value: '加入购物车' })
      .addStep('进入购物车', 'click', undefined, { type: 'text' as any, value: '购物车' })
      .addStep('验证存在', 'text_exists', { text: '商品名称' })
      .addCriticalElement('加入购物车').addCriticalElement('购物车')
      .setStepRange(5, 12).build(),

    DatasetBuilder.sample()
      .setId('L2-e2e-register-001').setDifficulty('L2').setCategory('e2e')
      .setAppState('register_page').setTask('注册新账号完整流程').setExpectedResult('注册成功')
      .addStep('填用户名', 'input_text', { text: 'newuser' }, { type: 'text' as any, value: '用户名' })
      .addStep('填邮箱', 'input_text', { text: 'new@test.com' }, { type: 'text' as any, value: '邮箱' })
      .addStep('填密码', 'input_text', { text: 'Secure@123' }, { type: 'text' as any, value: '密码' })
      .addStep('填手机号', 'input_text', { text: '13900000000' }, { type: 'text' as any, value: '手机号' })
      .addStep('获取验证码', 'click', undefined, { type: 'text' as any, value: '获取验证码' })
      .addStep('输入验证码', 'input_text', { text: '123456' }, { type: 'text' as any, value: '验证码' })
      .addStep('同意协议', 'click', undefined, { type: 'text' as any, value: '同意协议' })
      .addStep('点击注册', 'click', undefined, { type: 'text' as any, value: '注册' })
      .addStep('验证成功', 'text_exists', { text: '注册成功' })
      .setVariable('verifyCode', '123456').setStepRange(8, 18).build(),

    DatasetBuilder.sample()
      .setId('L2-multi-tab-001').setDifficulty('L2').setCategory('e2e')
      .setAppState('home').setTask('依次切换底部Tab并验证加载')
      .setExpectedResult('所有Tab正常切换')
      .addStep('点消息Tab', 'click', undefined, { type: 'text' as any, value: '消息' })
      .addStep('验证消息页', 'text_exists', { text: '消息列表' })
      .addStep('点我的Tab', 'click', undefined, { type: 'text' as any, value: '我的' })
      .addStep('验证我的页', 'text_exists', { text: '个人中心' })
      .addStep('点首页Tab', 'click', undefined, { type: 'text' as any, value: '首页' })
      .addStep('验证首页', 'text_exists', { text: '首页' })
      .setStepRange(6, 12).build(),
  );

  // ==========================================================
  // L3 — 错误注入与自愈验证（4 条）
  // ==========================================================
  s.push(
    DatasetBuilder.fixSample('L3-fix-element-001', '按钮文案变更需备用定位器', FailureType.ELEMENT_NOT_FOUND, 'Element not found: type=text, value=登录'),
    DatasetBuilder.fixSample('L3-fix-timeout-001', '页面加载超时需梯度等待', FailureType.TIMEOUT, 'Operation timed out after 10000ms'),
    DatasetBuilder.fixSample('L3-fix-crash-001', '应用崩溃后需重启恢复', FailureType.CRASH, 'Application crashed: NullPointerException'),

    DatasetBuilder.sample()
      .setId('L3-robust-001').setDifficulty('L3').setCategory('robustness')
      .setAppState('mixed').setTask('连续操作含多种潜在错误').setExpectedResult('最终完成任务或明确报告失败')
      .addStep('查找不确定存在的按钮', 'click', undefined, { type: 'text' as any, value: '可能不存在' })
      .addStep('等待动态内容', 'wait', { duration: 5000 })
      .addStep('再次尝试', 'click', undefined, { type: 'text' as any, value: '确定' })
      .addCriticalElement('确定').setStepRange(1, 20).build(),
  );

  return s;
}
