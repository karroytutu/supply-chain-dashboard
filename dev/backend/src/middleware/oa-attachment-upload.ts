import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// 存储路径
const uploadDir = path.join(__dirname, '../../uploads/oa-attachment');

// 确保目录存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// multer 存储配置
const storage = multer.diskStorage({
  destination: (_req: Request, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req: Request, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `oa-${uniqueSuffix}${ext}`);
  },
});

// 文件过滤 - 支持图片 + 常见办公文档
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件格式，请上传图片或文档文件'));
  }
};

// 导出上传中间件（支持多文件上传，最多10个）
export const uploadOaAttachment = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 单文件最大5MB
    files: 10, // 最多10个文件
  },
});

/**
 * 获取文件访问URL
 * @param filename - 文件名
 * @returns 文件的访问URL路径
 */
export function getOaAttachmentUrl(filename: string): string {
  return `/uploads/oa-attachment/${filename}`;
}
