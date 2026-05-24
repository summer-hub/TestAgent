/**
 * StackBlur 测试用例生成器
 * 从源码分析自动生成 .xlsx 测试用例表格
 *
 * 运行: npx tsx scripts/generate-test-cases.ts
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  id: string;
  module: string;
  testPoint: string;
  precondition: string;
  steps: string[];
  expectedResult: string;
  automatable: '是' | '部分' | '否';
  remark: string;
}

const PAGES_DIR = 'application/stackblur/entry/src/main/ets/pages';

// ====== 从源码中提取按钮文本 ======
function extractButtonTexts(source: string): string[] {
  const btnMatches = source.matchAll(/Button\(\$r\('app\.string\.(\w+)'\)\)/g);
  const texts: string[] = [];
  for (const m of btnMatches) {
    const key = m[1];
    texts.push(key);
  }
  return texts;
}

function extractSliderInfo(source: string): { min: number; max: number; default: number } | null {
  const slider = source.match(/min:\s*(\d+)[\s\S]*?max:\s*(\d+)[\s\S]*?value:\s*this\.(\w+)/);
  if (slider) {
    const defaultVal = source.match(/private\s+\w+\s+\w+\s*:\s*number\s*=\s*(\d+)/);
    return { min: parseInt(slider[1]), max: parseInt(slider[2]), default: defaultVal ? parseInt(defaultVal[1]) : 25 };
  }
  // Slider with value:
  const slider2 = source.match(/value:\s*(\d+)[\s\S]*?min:\s*(\d+)[\s\S]*?max:\s*(\d+)/);
  const def2 = source.match(/radius\s*:\s*number\s*=\s*(\d+)/);
  if (slider2) {
    return { min: parseInt(slider2[2]), max: parseInt(slider2[3]), default: def2 ? parseInt(def2[1]) : parseInt(slider2[1]) };
  }
  return null;
}

function extractPageTitle(source: string): string {
  const titleMatch = source.match(/demo_\d{3}_title/);
  if (titleMatch) return titleMatch[0];
  return '';
}

// ====== 测试用例定义 ======
function generateDemo001Cases(source: string): TestCase[] {
  const slider = extractSliderInfo(source);
  const radius = slider?.default ?? 25;

  return [
    {
      id: 'TC-SB-001-01',
      module: '【001】纯 ArkTS 图像模糊处理',
      testPoint: '加载测试图片 — Manager 初始化',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 应用已启动至导航页',
      steps: [
        '1. 点击导航页的 【001】纯 ArkTS 图像模糊处理 列表项',
        '2. 在 001 页面点击 "加载测试图片" 按钮',
      ],
      expectedResult: '图片展示区显示测试图片（android_platform_256.png），下方状态文本显示 "图片已加载，StackBlurManager 已创建（未执行模糊）"',
      automatable: '是',
      remark: '通过截图+文本检测验证：1) 图片区域非空 2) 状态文本包含 "已加载"',
    },
    {
      id: 'TC-SB-001-02',
      module: '【001】纯 ArkTS 图像模糊处理',
      testPoint: '未模糊时 returnBlurredImage() 返回 null',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-001-01',
      steps: [
        '1. 在 001 页面点击 "获取最近模糊结果" 按钮',
      ],
      expectedResult: '状态文本显示 "returnBlurredImage() 返回 null（未执行过模糊）"，图片展示区不更新',
      automatable: '是',
      remark: '通过文本检测验证状态文本包含 "返回 null"',
    },
    {
      id: 'TC-SB-001-03',
      module: '【001】纯 ArkTS 图像模糊处理',
      testPoint: 'process(radius) 执行模糊',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-001-01',
      steps: [
        `1. 确认半径滑块值为 ${radius}（默认值）`,
        '2. 点击 "执行 ArkTS 模糊" 按钮',
      ],
      expectedResult: `图片展示区更新为模糊后的图像，图片与原始图相比模糊程度明显；状态文本显示 "process(${radius}) 执行完成"`,
      automatable: '部分',
      remark: '1) 状态文本可自动化验证 2) 模糊效果需截图像素对比（计算 PSNR/SSIM），当前暂不支持',
    },
    {
      id: 'TC-SB-001-04',
      module: '【001】纯 ArkTS 图像模糊处理',
      testPoint: 'getImage() 返回原始未修改图像',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-001-03',
      steps: [
        '1. 点击 "获取原始图像" 按钮',
      ],
      expectedResult: '图片展示区恢复为原始未模糊图像；状态文本显示 "getImage() 返回原始图像"',
      automatable: '是',
      remark: '状态文本可自动化验证；图像恢复需截图对比原始图',
    },
    {
      id: 'TC-SB-001-05',
      module: '【001】纯 ArkTS 图像模糊处理',
      testPoint: 'returnBlurredImage() 模糊后返回有效 PixelMap',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-001-03',
      steps: [
        '1. 点击 "获取最近模糊结果" 按钮',
      ],
      expectedResult: '状态文本显示 "returnBlurredImage() 返回有效 PixelMap"，图片展示区显示模糊后的图像',
      automatable: '是',
      remark: '状态文本可自动化验证',
    },
    {
      id: 'TC-SB-001-06',
      module: '【001】纯 ArkTS 图像模糊处理',
      testPoint: '不同 radius 值模糊效果对比',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-001-01',
      steps: [
        '1. 拖动半径滑块到 1',
        '2. 点击 "执行 ArkTS 模糊" 按钮',
        '3. 拖动半径滑块到 50',
        '4. 再次点击 "执行 ArkTS 模糊" 按钮',
      ],
      expectedResult: 'radius=1 时图片几乎无变化；radius=50 时图片明显更模糊（模糊程度随 radius 增大而加深）',
      automatable: '部分',
      remark: '1) 状态文本可自动化（显示不同 radius）2) 模糊程度对比需要像素分析，当前暂无法自动验证',
    },
  ];
}

function generateDemo002Cases(source: string): TestCase[] {
  return [
    {
      id: 'TC-SB-002-01',
      module: '【002】Native C 高性能模糊对比',
      testPoint: '进入页面图片自动加载',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 应用已启动至导航页',
      steps: [
        '1. 点击导航页的 【002】Native C 高性能模糊对比 列表项',
      ],
      expectedResult: '图片展示区显示测试图片，三个耗时行显示 "—"，状态文本显示 "图片已加载，可开始模糊对比测试"',
      automatable: '是',
      remark: '文本检测验证：1) 状态文本包含 "已加载" 2) 三个耗时行内容为 "—"',
    },
    {
      id: 'TC-SB-002-02',
      module: '【002】Native C 高性能模糊对比',
      testPoint: 'ArkTS 模糊（process）耗时记录',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-002-01',
      steps: [
        '1. 点击 "ArkTS 模糊（耗时对比）" 按钮',
        '2. 等待模糊执行完成',
      ],
      expectedResult: 'ArkTS 耗时行显示具体毫秒数（如 "XX ms"）；状态文本显示 "process() 完成，耗时 XX ms"；图片展示区更新为模糊图',
      automatable: '是',
      remark: '1) 状态文本可自动化 2) 耗时数值可读取 3) 模糊效果见图',
    },
    {
      id: 'TC-SB-002-03',
      module: '【002】Native C 高性能模糊对比',
      testPoint: 'Native C 模糊（processNatively）耗时记录',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-002-01',
      steps: [
        '1. 点击 "Native C 模糊" 按钮',
        '2. 等待模糊执行完成',
      ],
      expectedResult: 'Native C 耗时行显示具体毫秒数（如 "X ms"）；状态文本显示 "processNatively() 完成，耗时 X ms"',
      automatable: '是',
      remark: '耗时数值可读取验证',
    },
    {
      id: 'TC-SB-002-04',
      module: '【002】Native C 高性能模糊对比',
      testPoint: 'RenderScript 兼容模糊耗时',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-002-01',
      steps: [
        '1. 点击 "RenderScript 兼容模糊" 按钮',
        '2. 等待模糊执行完成',
      ],
      expectedResult: 'RenderScript 耗时行显示具体毫秒数（如 "X ms"）；状态文本显示 "processRenderScript() 完成，耗时 X ms"',
      automatable: '是',
      remark: '耗时数值可读取验证',
    },
    {
      id: 'TC-SB-002-05',
      module: '【002】Native C 高性能模糊对比',
      testPoint: '性能对比：Native C 显著快于 ArkTS',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-002-02、TC-SB-002-03',
      steps: [
        '1. 记录 TC-SB-002-02 的 ArkTS 耗时 A',
        '2. 记录 TC-SB-002-03 的 Native C 耗时 B',
        '3. 计算比值 A/B',
      ],
      expectedResult: 'A/B 比值 > 10（Native C 耗时显著低于 ArkTS，根据代码注释约 25-30 倍差距）',
      automatable: '部分',
      remark: '数值可自动化读取和计算，但具体倍数因设备性能而异，建议阈值设为 > 5 即视为通过',
    },
    {
      id: 'TC-SB-002-06',
      module: '【002】Native C 高性能模糊对比',
      testPoint: 'processNatively 与 processRenderScript 耗时接近',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-002-03、TC-SB-002-04',
      steps: [
        '1. 记录 Native C 耗时 N',
        '2. 记录 RenderScript 耗时 R',
        '3. 计算 |N-R|/max(N,R)',
      ],
      expectedResult: '两者耗时在 20% 以内差异（代码注释说明底层实现一致）',
      automatable: '部分',
      remark: '数值可自动化读取和计算',
    },
  ];
}

function generateDemo003Cases(source: string): TestCase[] {
  return [
    {
      id: 'TC-SB-003-01',
      module: '【003】模糊图像保存文件',
      testPoint: '进入页面加载资源',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 应用已启动至导航页',
      steps: [
        '1. 点击导航页的 【003】模糊图像保存文件 列表项',
      ],
      expectedResult: '页面加载完成，模糊结果区和文件预览区显示空白占位，半径滑块默认为 25',
      automatable: '是',
      remark: '页面结构验证可通过 UI dump 确认',
    },
    {
      id: 'TC-SB-003-02',
      module: '【003】模糊图像保存文件',
      testPoint: '未模糊时保存（边界测试）',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-003-01',
      steps: [
        '1. 直接点击 "未模糊时保存（边界测试）" 按钮（不执行任何模糊操作）',
      ],
      expectedResult: '状态文本显示 "边界测试通过：saveIntoFile() ... 提前返回，未写入文件"',
      automatable: '是',
      remark: '文本检测验证状态文本包含 "边界测试通过" 和 "提前返回"',
    },
    {
      id: 'TC-SB-003-03',
      module: '【003】模糊图像保存文件',
      testPoint: '执行模糊并保存到沙箱文件',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-003-01',
      steps: [
        '1. 点击 "执行模糊并保存" 按钮',
      ],
      expectedResult: '模糊结果区显示模糊后的图片；状态文本包含 "/data/storage/el2/base/haps/entry/files/stackblur_output.png"',
      automatable: '部分',
      remark: '1) 状态文本中的路径可自动化验证 2) 模糊效果见截图',
    },
    {
      id: 'TC-SB-003-04',
      module: '【003】模糊图像保存文件',
      testPoint: '从文件读取并预览',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-003-03',
      steps: [
        '1. 点击 "读取并预览文件" 按钮',
      ],
      expectedResult: '文件预览区显示与模糊结果区一致的图片；状态文本显示 "文件读取成功，已预览：..."',
      automatable: '部分',
      remark: '1) 状态文本可自动化 2) 图片一致性需截图对比',
    },
    {
      id: 'TC-SB-003-05',
      module: '【003】模糊图像保存文件',
      testPoint: '未保存时点击"读取并预览"',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 首次进入页面、未执行过保存',
      steps: [
        '1. （跳过保存步骤）直接点击 "读取并预览文件" 按钮',
      ],
      expectedResult: '状态文本显示 "文件不存在，请先执行"执行模糊并保存""',
      automatable: '是',
      remark: '文件不存在路径可通过 sandbox 中检查，当没有执行过保存时文件确实不存在',
    },
  ];
}

function generateDemo004Cases(source: string): TestCase[] {
  return [
    {
      id: 'TC-SB-004-01',
      module: '【004】安卓原库 demo',
      testPoint: '进入主演示页面',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 应用已启动至导航页',
      steps: [
        '1. 点击导航页的 【004】安卓原库 demo 列表项',
      ],
      expectedResult: '页面显示测试图片，模糊模式默认显示 "ArkTS"，半径滑块默认值为 10，底部有 "性能对比" 跳转按钮',
      automatable: '是',
      remark: 'UI dump 检查页面结构确认元素存在',
    },
    {
      id: 'TC-SB-004-02',
      module: '【004】安卓原库 demo',
      testPoint: 'ArkTS 模式实时模糊',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-004-01',
      steps: [
        '1. 确认模糊模式为 "ArkTS"',
        '2. 拖动半径滑块到 25',
      ],
      expectedResult: '图片展示区实时更新为模糊效果（radius=25），模糊程度明显',
      automatable: '部分',
      remark: '滑块滑动触发 process() 调用，效果需截图验证',
    },
    {
      id: 'TC-SB-004-03',
      module: '【004】安卓原库 demo',
      testPoint: 'Native C 模式切换',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-004-01',
      steps: [
        '1. 下拉选择模糊模式为 "Native C"',
        '2. 拖动半径滑块到 25',
      ],
      expectedResult: '图片展示区更新为 Native C 方式模糊结果，与 ArkTS 模式效果视觉一致但响应更快',
      automatable: '部分',
      remark: '视觉一致性需截图对比',
    },
    {
      id: 'TC-SB-004-04',
      module: '【004】安卓原库 demo',
      testPoint: '跳转 Benchmark 页面',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-004-01',
      steps: [
        '1. 点击顶部的 "性能对比" 按钮',
      ],
      expectedResult: '跳转到 Benchmark 页面，页面标题显示 "性能对比 (Benchmark)"',
      automatable: '是',
      remark: 'UI dump 验证新页面的标题文本',
    },
  ];
}

function generateBenchmarkCases(source: string): TestCase[] {
  return [
    {
      id: 'TC-SB-BM-01',
      module: 'Benchmark 性能对比',
      testPoint: 'Benchmark 页面加载',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 应用已启动',
      steps: [
        '1. 从导航页进入 【004】安卓原库 demo',
        '2. 点击 "性能对比" 按钮跳转',
      ],
      expectedResult: '页面显示 "性能对比 (Benchmark)" 标题；图片区域占位文本显示 "拖动下方滑块开始测试"',
      automatable: '是',
      remark: 'UI dump 确认标题和占位文本',
    },
    {
      id: 'TC-SB-BM-02',
      module: 'Benchmark 性能对比',
      testPoint: '滑块触发并行模糊测试',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-BM-01',
      steps: [
        '1. 拖动半径滑块到 20',
        '2. 等待两组模糊执行完成',
      ],
      expectedResult: '图片展示区显示三等分对比图（左 ArkTS / 中 Native / 右原图）; 两个进度条显示耗时 ms 数; 状态文本显示 "ArkTS: X ms | Native: Y ms | 加速比: Z×"',
      automatable: '部分',
      remark: '1) 状态文本可自动化 2) 加速比可验证 > 0 3) 三等分图需确认非空',
    },
    {
      id: 'TC-SB-BM-03',
      module: 'Benchmark 性能对比',
      testPoint: '不同半径重复测试',
      precondition: '1. 安装 hap 包\n2. 设备已连接 HDC\n3. 已执行 TC-SB-BM-01',
      steps: [
        '1. 滑块拖到 5，等待完成',
        '2. 滑块拖到 50，等待完成',
        '3. 对比两次加速比',
      ],
      expectedResult: 'radius 越大，两组耗时的绝对值越大，但 Native C 始终比 ArkTS 快（加速比 > 5）',
      automatable: '部分',
      remark: '数值可自动化对比；通过多次测试验证趋势',
    },
  ];
}

// ====== Main ======
async function main() {
  console.log('📋 StackBlur 测试用例生成器\n');

  // 读取所有源码
  const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.ets'));

  // 构建测试用例
  const allCases: TestCase[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(PAGES_DIR, file), 'utf-8');
    const buttons = extractButtonTexts(content);
    const slider = extractSliderInfo(content);

    if (file.includes('001_ArkTsBlurPage')) {
      allCases.push(...generateDemo001Cases(content));
    } else if (file.includes('002_NativeBlurComparePage')) {
      allCases.push(...generateDemo002Cases(content));
    } else if (file.includes('003_BlurSaveFilePage')) {
      allCases.push(...generateDemo003Cases(content));
    } else if (file.includes('Index')) {
      allCases.push(...generateDemo004Cases(content));
    } else if (file.includes('Benchmark')) {
      allCases.push(...generateBenchmarkCases(content));
    }
  }

  // 生成 Excel
  const rows = allCases.map((tc, i) => ({
    '用例编号': tc.id,
    '所属模块': tc.module,
    '测试点': tc.testPoint,
    '前置条件': tc.precondition,
    '测试步骤': tc.steps.map((s, i) => `${i+1}. ${s}`).join('\n'),
    '预期结果': tc.expectedResult,
    '可自动化验证': tc.automatable,
    '备注': tc.remark,
  }));

  const wb = XLSX.utils.book_new();

  // 按模块分组 Sheet
  const moduleGroups = new Map<string, typeof rows>();
  rows.forEach(r => {
    const mod = r['所属模块'].match(/【\d{3}】/) ? r['所属模块'] : 'Benchmark';
    if (!moduleGroups.has(mod)) moduleGroups.set(mod, []);
    moduleGroups.get(mod)!.push(r);
  });

  for (const [mod, data] of moduleGroups) {
    const ws = XLSX.utils.json_to_sheet(data);
    // 设置列宽
    ws['!cols'] = [
      { wch: 16 },  // 编号
      { wch: 18 },  // 模块
      { wch: 26 },  // 测试点
      { wch: 30 },  // 前置条件
      { wch: 50 },  // 步骤
      { wch: 50 },  // 预期结果
      { wch: 14 },  // 可自动化
      { wch: 40 },  // 备注
    ];
    // 截取 sheet name（Excel 限制 31 字符）
    const sheetName = mod.replace(/【(\d{3})】/g, '$1.').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const outPath = 'stackblur_test_cases.xlsx';
  XLSX.writeFile(wb, outPath);
  console.log(`✅ 已生成: ${outPath}`);
  console.log(`   ${allCases.length} 个测试用例`);
  console.log(`   ${moduleGroups.size} 个 Sheet\n`);

  // 打印摘要
  console.log('📊 测试用例统计:');
  for (const [mod, data] of moduleGroups) {
    const auto = data.filter(r => r['可自动化验证'] === '是').length;
    const partial = data.filter(r => r['可自动化验证'] === '部分').length;
    const no = data.filter(r => r['可自动化验证'] === '否').length;
    console.log(`   ${mod}: ${data.length} 用例 (可自动:${auto} 部分:${partial} 不可:${no})`);
  }
}

main().catch(err => {
  console.error(`❌ 生成失败: ${err.message}`);
  process.exit(1);
});
