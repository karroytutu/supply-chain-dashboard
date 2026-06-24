/**
 * 电子签名组件
 * 基于 Canvas 的手写签名控件，支持复用历史签名
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button, Space, Modal, List, Typography, Empty } from 'antd';
import { DeleteOutlined, HistoryOutlined, CheckOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface SignaturePadProps {
  /** 当前签名值（base64 data URL） */
  value?: string;
  /** 值变更回调 */
  onChange?: (value: string | undefined) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 历史签名列表（base64 data URL 数组） */
  historySignatures?: string[];
  /** 画布宽度 */
  width?: number;
  /** 画布高度 */
  height?: number;
}

/**
 * 电子签名画布组件
 */
export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  readOnly = false,
  historySignatures = [],
  width = 400,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!value);
  const [showHistory, setShowHistory] = useState(false);

  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布尺寸
    canvas.width = width;
    canvas.height = height;

    // 设置绘制样式
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 如果有已有值，绘制到画布上
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = value;
    } else {
      // 清空画布并绘制背景
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, width, height);
      // 绘制提示文字
      ctx.fillStyle = '#bfbfbf';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('请在此处签名', width / 2, height / 2);
    }
  }, [width, height, value]);

  // 获取鼠标/触摸位置
  const getPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }, []);

  // 开始绘制
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const pos = getPosition(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [readOnly, getPosition]);

  // 绘制中
  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || readOnly) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPosition(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, readOnly, getPosition]);

  // 结束绘制（仅结束绘制状态，不自动提交）
  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // 不自动调用 onChange —— 由用户点击“确认签名”按钮显式提交
  }, [isDrawing]);

  // 清空签名
  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#bfbfbf';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('请在此处签名', width / 2, height / 2);

    setHasSignature(false);
    onChange?.(undefined);
  }, [width, height, onChange]);

  // 使用历史签名
  const applyHistorySignature = useCallback((signature: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      setHasSignature(true);
      onChange?.(signature);
      setShowHistory(false);
    };
    img.src = signature;
  }, [width, height, onChange]);

  // 只读模式：显示签名图片
  if (readOnly) {
    if (!value) {
      return <Text type="secondary">未签名</Text>;
    }
    return (
      <img
        src={value}
        alt="签名"
        style={{
          maxWidth: width,
          maxHeight: height,
          border: '1px solid #d9d9d9',
          borderRadius: 4,
        }}
      />
    );
  }

  return (
    <div>
      <div
        style={{
          border: '1px solid #d9d9d9',
          borderRadius: 4,
          display: 'inline-block',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ display: 'block', cursor: readOnly ? 'default' : 'crosshair' }}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <Space>
          {hasSignature && (
            <Button
              size="small"
              icon={<DeleteOutlined />}
              onClick={clearSignature}
              danger
            >
              清除
            </Button>
          )}
          {historySignatures.length > 0 && (
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => setShowHistory(true)}
            >
              历史签名
            </Button>
          )}
          {hasSignature && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => {
                const canvas = canvasRef.current;
                if (canvas) {
                  const dataUrl = canvas.toDataURL('image/png');
                  onChange?.(dataUrl);
                }
              }}
            >
              确认签名
            </Button>
          )}
        </Space>
      </div>

      {/* 历史签名选择弹窗 */}
      <Modal
        title="选择历史签名"
        open={showHistory}
        onCancel={() => setShowHistory(false)}
        footer={null}
        width={500}
      >
        {historySignatures.length === 0 ? (
          <Empty description="暂无历史签名" />
        ) : (
          <List
            dataSource={historySignatures}
            renderItem={(sig, index) => (
              <List.Item
                actions={[
                  <Button
                    key="use"
                    type="primary"
                    size="small"
                    onClick={() => applyHistorySignature(sig)}
                  >
                    使用此签名
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <img
                      src={sig}
                      alt={`签名 ${index + 1}`}
                      style={{ width: 120, height: 60, objectFit: 'contain', border: '1px solid #d9d9d9' }}
                    />
                  }
                  title={`签名 ${index + 1}`}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  );
};

export default SignaturePad;
