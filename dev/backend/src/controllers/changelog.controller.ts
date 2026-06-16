import { Request, Response } from 'express';
import { access, readFile } from 'fs/promises';
import path from 'path';

/**
 * 获取 changelog.json 文件路径
 * - 开发环境：dev/backend/data/changelog.json（相对于项目根目录）
 * - 生产环境：/app/data/changelog.json（Docker volume 挂载路径）
 */
function getChangelogPath(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return '/app/data/changelog.json';
  }
  // 开发环境：从 src/controllers 向上三级到项目根目录，再进入 dev/backend/data
  return path.resolve(__dirname, '../../../data/changelog.json');
}

/**
 * 获取更新日志
 * GET /api/changelog
 */
export async function getChangelog(_req: Request, res: Response): Promise<void> {
  const filePath = getChangelogPath();

  res.set('Cache-Control', 'no-cache');

  try {
    await access(filePath);
  } catch {
    res.json({ entries: [] });
    return;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    res.json(data);
  } catch {
    res.json({ entries: [] });
  }
}
