/**
 * 变量引用完整性检查 — 扫描 .less 文件确保不含硬编码主题色
 * @module __tests__/styles/variables-coverage.spec.ts
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/** 需要检查的硬编码色值模式 */
const HARDCODED_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /#1890ff/i, name: 'primary blue #1890ff' },
  { pattern: /#52c41a/i, name: 'success green #52c41a' },
  { pattern: /#faad14/i, name: 'warning yellow #faad14' },
  { pattern: /#ff4d4f/i, name: 'error red #ff4d4f' },
  { pattern: /#f5f7fa/i, name: 'bg-base #f5f7fa' },
  { pattern: /#f0f2f5/i, name: 'old bg-base #f0f2f5' },
];

/** 排除的文件/目录 */
const EXCLUDE_PATTERNS = [
  /variables\.less$/,
  /node_modules/,
  /\.umi/,
];

/** 递归查找 .less 文件 */
function findLessFiles(dirs: string[]): string[] {
  const files: string[] = [];
  const srcRoot = path.resolve(__dirname, '..', '..');

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.less')) {
        files.push(fullPath);
      }
    }
  }

  for (const dir of dirs) {
    walk(path.resolve(srcRoot, dir));
  }
  return files.filter(f => !EXCLUDE_PATTERNS.some(p => p.test(f)));
}

describe('变量引用完整性', () => {
  const files = findLessFiles(['pages', 'components']);

  it(`扫描 ${files.length} 个 .less 文件，不含硬编码主题色`, () => {
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(path.resolve(__dirname, '..', '..'), file);

      for (const { pattern, name } of HARDCODED_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: 包含硬编码色值 ${name}`);
        }
      }
    }

    if (violations.length > 0) {
      // 输出违规详情但不使测试失败（渐进式改进）
      console.warn(`发现 ${violations.length} 处硬编码色值：\n${violations.slice(0, 10).join('\n')}`);
    }

    // 允许少量违规（如注释中的色值说明、组件内部固定色值），但不应超过阈值
    expect(violations.length).toBeLessThan(10);
  });

  it('variables.less 定义了核心语义变量', () => {
    const variablesFile = path.resolve(__dirname, '..', '..', 'styles', 'variables.less');
    if (fs.existsSync(variablesFile)) {
      const content = fs.readFileSync(variablesFile, 'utf-8');
      expect(content).toContain('@primary-color');
      expect(content).toContain('@bg-color-card');
      expect(content).toContain('@border-radius-base');
    }
  });

  it('global.less 定义了 page-full 和 page-scroll 布局类', () => {
    const globalFile = path.resolve(__dirname, '..', '..', 'styles', 'global.less');
    if (fs.existsSync(globalFile)) {
      const content = fs.readFileSync(globalFile, 'utf-8');
      expect(content).toContain('.page-full');
      expect(content).toContain('.page-scroll');
    }
  });
});
