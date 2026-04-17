import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// 存储路径
const uploadDir = path.join(__dirname, '../../uploads/ar-evidence');

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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `evidence-${uniqueSuffix}${ext}`);
  },
});

// 文件过滤 - 验证 MIME 类型和扩展名
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传 jpg/jpeg/png 格式的图片'));
  }
};

// 导出上传中间件
export const uploadEvidence = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 最大5MB
  },
});

/**
 * 获取文件访问URL
 * @param filename - 文件名
 * @returns 文件的访问URL路径
 */
export function getFileUrl(filename: string): string {
  return `/uploads/ar-evidence/${filename}`;
}
