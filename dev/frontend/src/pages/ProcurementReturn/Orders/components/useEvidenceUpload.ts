/**
 * 退货凭证上传 Hook
 * 封装多图上传逻辑：防抖批量上传、文件校验、删除管理
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { uploadReturnEvidence } from '@/services/api/procurement-return';

const MAX_COUNT = 9;

export function useEvidenceUpload() {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const pendingFilesRef = useRef<File[]>([]);
  const uploadTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 重置状态
  const reset = useCallback(() => {
    setFileList([]);
    setEvidenceUrls([]);
    pendingFilesRef.current = [];
    if (uploadTimerRef.current) {
      clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
  }, []);

  // 弹窗打开时重置
  useEffect(() => {
    return () => {
      if (uploadTimerRef.current) {
        clearTimeout(uploadTimerRef.current);
      }
    };
  }, []);

  // 执行批量上传
  const doUpload = useCallback(async () => {
    const filesToUpload = [...pendingFilesRef.current];
    pendingFilesRef.current = [];

    if (filesToUpload.length === 0) return;

    const availableSlots = MAX_COUNT - fileList.length;
    const actualFiles = filesToUpload.slice(0, availableSlots);

    if (actualFiles.length === 0) {
      message.warning(`最多上传 ${MAX_COUNT} 张图片`);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadReturnEvidence(actualFiles);
      if (result.urls && result.urls.length > 0) {
        const newFiles: UploadFile[] = result.urls.map((url, index) => ({
          uid: `${Date.now()}-${index}-${Math.random()}`,
          name: actualFiles[index]?.name || `image-${index}`,
          status: 'done' as const,
          url,
        }));

        setFileList(prev => [...prev, ...newFiles]);
        setEvidenceUrls(prev => [...prev, ...result.urls]);
        message.success(`成功上传 ${result.urls.length} 张图片`);
      }
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  }, [fileList.length]);

  // 处理文件选择前的验证
  const handleBeforeUpload = useCallback((file: File): false => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      message.error('只支持 jpg/jpeg/png 格式的图片');
      return false;
    }

    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('图片大小不能超过 5MB');
      return false;
    }

    const currentCount = fileList.length + pendingFilesRef.current.length;
    if (currentCount >= MAX_COUNT) {
      message.warning(`最多上传 ${MAX_COUNT} 张图片`);
      return false;
    }

    pendingFilesRef.current.push(file);

    if (uploadTimerRef.current) {
      clearTimeout(uploadTimerRef.current);
    }
    uploadTimerRef.current = setTimeout(() => {
      doUpload();
      uploadTimerRef.current = null;
    }, 200);

    return false;
  }, [fileList.length, doUpload]);

  // 删除图片
  const handleRemove = useCallback((file: UploadFile) => {
    const index = fileList.findIndex(f => f.uid === file.uid);
    if (index > -1) {
      setFileList(prev => prev.filter(f => f.uid !== file.uid));
      setEvidenceUrls(prev => prev.filter((_, i) => i !== index));
    }
  }, [fileList]);

  return {
    fileList,
    evidenceUrls,
    uploading,
    handleBeforeUpload,
    handleRemove,
    reset,
    maxCount: MAX_COUNT,
  };
}
