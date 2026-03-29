/**
 * 手写签名组件
 * 基于 Canvas 实现，支持 PC 和移动端
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button, Select, Space, message } from 'antd';
import { ClearOutlined, CheckOutlined } from '@ant-design/icons';
import type { ArUserSignature } from '@/types/accounts-receivable';
import styles from './index.less';

interface SignaturePadProps {
  value?: string;
  onChange?: (signatureData: string) => void;
  signatures?: ArUserSignature[];
  onSelect?: (signature: ArUserSignature) => void;
  disabled?: boolean;
}

const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  signatures = [],
  onSelect,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [selectedSignatureId, setSelectedSignatureId] = useState<number | null>(null);

  // 初始化 Canvas
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布尺寸（考虑设备像素比）
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // 缩放上下文以匹配设备像素比
    ctx.scale(dpr, dpr);
    
    // 设置画笔样式
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // 组件挂载时初始化
  useEffect(() => {
    initCanvas();
    
    // 窗口大小变化时重新初始化
    const handleResize = () => {
      initCanvas();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initCanvas]);

  // 加载已有签名
  useEffect(() => {
    if (value && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
        setHasDrawing(true);
      };
      img.src = value;
    }
  }, [value]);

  // 获取鼠标/触摸位置
  const getPoint = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  // 开始绘制
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    
    const point = getPoint(e.nativeEvent as MouseEvent | TouchEvent);
    if (!point) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawing(true);
    
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }, [disabled]);

  // 绘制中
  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const point = getPoint(e.nativeEvent as MouseEvent | TouchEvent);
    if (!point) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }, [isDrawing, disabled]);

  // 结束绘制
  const endDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (canvas && onChange) {
      const dataUrl = canvas.toDataURL('image/png');
      onChange(dataUrl);
    }
  }, [isDrawing, onChange]);

  // 清除画布
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    setSelectedSignatureId(null);
    
    if (onChange) {
      onChange('');
    }
  }, [onChange]);

  // 选择历史签名
  const handleSelectSignature = (signatureId: number) => {
    const signature = signatures.find(s => s.id === signatureId);
    if (!signature) return;

    setSelectedSignatureId(signatureId);
    
    if (onSelect) {
      onSelect(signature);
    }
    
    if (onChange) {
      onChange(signature.signature_data);
    }
  };

  // 确认签名
  const confirmSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawing) {
      message.warning('请先签名');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    if (onChange) {
      onChange(dataUrl);
    }
    message.success('签名已确认');
  }, [hasDrawing, onChange]);

  return (
    <div className={styles.signaturePad}>
      {/* 历史签名选择 */}
      {signatures.length > 0 && (
        <div className={styles.signatureSelect}>
          <Select
            placeholder="选择历史签名"
            style={{ width: '100%' }}
            value={selectedSignatureId}
            onChange={handleSelectSignature}
            disabled={disabled}
            allowClear
            onClear={clearCanvas}
          >
            {signatures.map(sig => (
              <Select.Option key={sig.id} value={sig.id}>
                签名 {sig.id} {sig.is_default ? '(默认)' : ''}
              </Select.Option>
            ))}
          </Select>
        </div>
      )}

      {/* 签名画布 */}
      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
          style={{ touchAction: 'none' }}
        />
        {!hasDrawing && (
          <div className={styles.placeholder}>
            请在此处手写签名
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <Space className={styles.actions}>
        <Button
          icon={<ClearOutlined />}
          onClick={clearCanvas}
          disabled={disabled || !hasDrawing}
        >
          清除重画
        </Button>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={confirmSignature}
          disabled={disabled || !hasDrawing}
        >
          确认签名
        </Button>
      </Space>
    </div>
  );
};

export default SignaturePad;
