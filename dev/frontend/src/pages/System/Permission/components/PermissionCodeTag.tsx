/**
 * 权限编码可视化标签组件
 * 将三段式权限编码转换为直观的彩色标签
 */
import React, { useMemo } from 'react';
import { Tag, Tooltip, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

// 操作类型配色映射
const actionColorMap: Record<string, { bg: string; color: string }> = {
  read: { bg: '#e6fffb', color: '#13c2c2' },
  write: { bg: '#fff7e6', color: '#fa8c16' },
  delete: { bg: '#fff1f0', color: '#ff4d4f' },
  confirm: { bg: '#f9f0ff', color: '#722ed1' },
  collect: { bg: '#e6fffb', color: '#13c2c2' },
  penalty: { bg: '#fff1f0', color: '#ff4d4f' },
};

// 模块名称映射
const moduleNameMap: Record<string, string> = {
  system: '系统管理',
  procurement: '采购管理',
  return: '退货管理',
  'goods-rules': '退货规则',
  strategic: '战略商品',
};

interface PermissionCodeTagProps {
  /** 权限编码，如 system:user:read */
  code: string;
  /** 是否显示复制按钮 */
  showCopy?: boolean;
  /** 是否显示原始编码 */
  showRawCode?: boolean;
}

const PermissionCodeTag: React.FC<PermissionCodeTagProps> = ({
  code,
  showCopy = true,
  showRawCode = false,
}) => {
  // 解析权限编码
  const segments = useMemo(() => {
    const parts = code.split(':');
    if (parts.length < 3) {
      // 非标准编码，返回原始格式
      return {
        module: parts[0] || '',
        resource: parts[1] || '',
        action: parts[2] || '',
        moduleName: parts[0] || '',
        isValid: false,
      };
    }

    const [module, resource, action] = parts;
    return {
      module,
      resource,
      action,
      moduleName: moduleNameMap[module] || module,
      isValid: true,
    };
  }, [code]);

  // 获取操作类型的配色
  const actionStyle = actionColorMap[segments.action] || { bg: '#f0f0f0', color: '#666' };

  // 复制权限编码
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    message.success('权限编码已复制');
  };

  const tagContent = (
    <span className="permission-code-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {/* 模块段 - 蓝色 */}
      <Tag
        style={{
          background: '#e6f4ff',
          color: '#1677ff',
          border: 'none',
          margin: 0,
          borderRadius: 4,
        }}
      >
        {segments.moduleName}
      </Tag>
      <span style={{ color: '#bfbfbf' }}></span>
      {/* 资源段 - 绿色 */}
      <Tag
        style={{
          background: '#f6ffed',
          color: '#52c41a',
          border: 'none',
          margin: 0,
          borderRadius: 4,
        }}
      >
        {segments.resource}
      </Tag>
      <span style={{ color: '#bfbfbf' }}></span>
      {/* 操作段 - 动态配色 */}
      <Tag
        style={{
          background: actionStyle.bg,
          color: actionStyle.color,
          border: 'none',
          margin: 0,
          borderRadius: 4,
        }}
      >
        {segments.action}
      </Tag>
      {/* 原始编码 */}
      {showRawCode && (
        <code
          style={{
            fontSize: 11,
            color: '#8c8c8c',
            background: '#f5f5f5',
            padding: '2px 6px',
            borderRadius: 4,
            marginLeft: 4,
          }}
        >
          {code}
        </code>
      )}
      {/* 复制按钮 */}
      {showCopy && (
        <CopyOutlined
          style={{ fontSize: 12, color: '#8c8c8c', cursor: 'pointer', marginLeft: 4 }}
          onClick={handleCopy}
        />
      )}
    </span>
  );

  // 显示完整编码的 Tooltip
  return (
    <Tooltip title={`权限编码: ${code}`}>
      {tagContent}
    </Tooltip>
  );
};

export default PermissionCodeTag;
