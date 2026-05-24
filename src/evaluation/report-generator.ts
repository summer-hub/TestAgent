/**
 * ReportGenerator - 评测报告生成器
 * 输出 Markdown + JSON 格式报告
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { EvalReport, EvalSampleResult, EvalMetrics, LevelScores, StepComparison } from './types';

/**
 * ReportGenerator - 报告生成器
 */
export class ReportGenerator {
  /**
   * 生成 Markdown 报告
   */
  toMarkdown(report: EvalReport): string {
    const m = report.metrics;
    const lines: string[] = [
      `# AI Test Agent 评测报告`,
      '',
      `**报告 ID**: ${report.id}`,
      `**评测时间**: ${new Date(report.timestamp).toISOString()}`,
      `**版本**: ${report.version}`,
      `**样本总数**: ${report.totalSamples}`,
      `**总耗时**: ${this.formatMs(report.totalDuration)}`,
      '',
      '---',
      '',
      '## 综合得分',
      '',
      `| 指标 | 得分 |`,
      `|------|------|`,
      `| **加权综合得分** | **${m.weightedScore.toFixed(1)} / 100** |`,
      '',
      '---',
      '',
      '## 任务成功指标',
      '',
      this.metricRow('用例通过率 (Case Pass Rate)', pct(m.casePassRate)),
      this.metricRow('步骤通过率 (Step Pass Rate)', pct(m.stepPassRate)),
      this.metricRow('一次通过率 (First-Attempt Rate)', pct(m.firstAttemptRate)),
      '',
      '## 自愈能力指标',
      '',
      this.metricRow('自愈触发率', pct(m.fixTriggerRate)),
      this.metricRow('自愈成功率', pct(m.fixSuccessRate)),
      this.metricRow('自愈额外开销', `${m.fixOverheadMs}ms`),
      '',
      '## 效率指标',
      '',
      this.metricRow('平均步数/用例', m.avgStepsPerCase.toFixed(1)),
      this.metricRow('平均 Think 耗时', `${m.avgThinkLatencyMs}ms`),
      this.metricRow('平均 Act 耗时', `${m.avgActLatencyMs}ms`),
      this.metricRow('平均用例耗时', `${m.avgCaseDurationMs}ms`),
      '',
      '## 正确性指标',
      '',
      this.metricRow('工具选择准确率', pct(m.toolAccuracy)),
      this.metricRow('定位器准确率', pct(m.locatorAccuracy)),
      this.metricRow('参数准确率', pct(m.paramAccuracy)),
      this.metricRow('断言准确率', pct(m.assertionAccuracy)),
      '',
      '---',
      '',
      '## 分层表现',
      '',
      this.levelTable(report.levelScores),
      '',
      '## 分类表现',
      '',
      this.categoryTable(report.categoryScores),
      '',
      '---',
      '',
      `## 摘要`,
      '',
      '```',
      report.summary,
      '```',
      '',
      '---',
      '',
      '## 详细结果',
      '',
      ...this.detailSections(report.details),
    ];

    return lines.join('\n');
  }

  /**
   * 生成 Markdown 报告并写入文件
   */
  async saveMarkdown(report: EvalReport, outputPath: string): Promise<void> {
    const md = this.toMarkdown(report);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, md, 'utf-8');
  }

  /**
   * 生成 JSON 报告并写入文件
   */
  async saveJson(report: EvalReport, outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  }

  /**
   * 详细结果区段
   */
  private detailSections(details: EvalSampleResult[]): string[] {
    const lines: string[] = [];
    for (const detail of details) {
      const status = detail.statusMatch ? '✅' : '❌';
      lines.push(
        `### ${status} ${detail.sampleId} (${detail.difficulty})`,
        '',
        `- **分类**: ${detail.category}`,
        `- **状态匹配**: ${detail.statusMatch ? '是' : '否'}`,
        `- **期望**: ${detail.expectedStatus} → **实际**: ${detail.actualStatus}`,
        `- **综合得分**: ${(detail.scores.composite * 100).toFixed(1)}%`,
        `- **步骤通过率**: ${(detail.scores.stepPassRate * 100).toFixed(1)}% | **工具准确**: ${(detail.scores.toolAccuracy * 100).toFixed(1)}% | **定位准确**: ${(detail.scores.locatorAccuracy * 100).toFixed(1)}%`,
        `- **耗时**: ${detail.duration}ms`,
      );
      if (detail.fixTriggered) {
        lines.push(`- **自愈**: ${detail.fixSuccess ? '成功' : '失败'}`);
      }
      if (detail.error) {
        lines.push(`- **错误**: ${detail.error}`);
      }
      if (detail.stepComparisons.length > 0) {
        lines.push('', this.stepTable(detail.stepComparisons));
      }
      lines.push('');
    }
    return lines;
  }

  /**
   * 步骤对比表
   */
  private stepTable(steps: StepComparison[]): string {
    const header = [
      '| 步骤 | 工具(实际/期望) | 工具匹配 | 定位匹配 | 参数 | 状态 | 耗时 |',
      '|------|-----------------|---------|---------|------|------|------|',
    ].join('\n');
    const rows = steps.map(s => {
      const tool = `${s.actualTool} / ${s.expectedTool}`;
      const toolOk = s.toolMatch ? '✅' : '❌';
      const locOk = s.locatorMatch ? '✅' : '❌';
      const paramOk = s.paramDetails.filter(d => d.match).length;
      const paramTotal = s.paramDetails.length;
      const paramStr = paramTotal > 0 ? `${paramOk}/${paramTotal}` : '-';
      const fixTag = s.fixTriggered ? (s.fixSuccess ? ' [已修复]' : ' [修复失败]') : '';
      return `| ${s.stepNumber} | ${tool} | ${toolOk} | ${locOk} | ${paramStr} | ${s.status}${fixTag} | ${s.duration}ms |`;
    });
    return [header, ...rows].join('\n');
  }

  /**
   * 分层表现表
   */
  private levelTable(levels: LevelScores): string {
    return [
      '| 难度 | 样本数 | 步通率 | 工具准确 | 定位准确 | 参数准确 | 综合 |',
      '|------|--------|--------|---------|---------|---------|------|',
      ...(['L0', 'L1', 'L2', 'L3'] as const).map(l =>
        `| ${l} | ${levels[l].count} | ${pct(levels[l].scores.stepPassRate)} | ${pct(levels[l].scores.toolAccuracy)} | ${pct(levels[l].scores.locatorAccuracy)} | ${pct(levels[l].scores.paramAccuracy)} | ${pct(levels[l].scores.composite)} |`
      ),
    ].join('\n');
  }

  /**
   * 分类表现表
   */
  private categoryTable(cats: Record<string, { count: number; scores: EvalSampleResult['scores'] }>): string {
    if (Object.keys(cats).length === 0) return '(无分类数据)';
    const header = '| 分类 | 样本数 | 综合得分 |\n|------|--------|---------|';
    const rows = Object.entries(cats).map(([name, data]) =>
      `| ${name} | ${data.count} | ${pct(data.scores.composite)} |`
    );
    return [header, ...rows].join('\n');
  }

  /**
   * 指标行
   */
  private metricRow(label: string, value: string): string {
    return `| ${label} | ${value} |`;
  }

  /**
   * 格式化毫秒
   */
  private formatMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
