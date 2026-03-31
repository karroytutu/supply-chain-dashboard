/**
 * 角色权限统计预览组件
 * 在角色表格中显示权限分布
 */
import React from 'react';
import { Tag } from 'antd';

// 模块名称映射
const moduleNames: Record<string, string> = {
  system: '系统',
  finance: '财务',
  procurement: '采购',
  return: '退货',
  'goods-rules': '规则',
  strategic: '战略',
};

// 模块配色映射
const moduleColors: Record<string, string> = {
  system: '#1677ff',
  finance: '#52c41a',
  procurement: '#fa8c16',
  return: '#13c2c2',
  'goods-rules': '#722ed1',
  strategic: '#eb2f96',
};

interface PermissionStat {
  module: string;
  count: number;
}

interface RolePermissionStatsProps {
  /** 权限统计列表 */
  stats: PermissionStat[];
  /** 最大显示数量 */
  maxShow?: number;
}

const RolePermissionStats: React.FC<RolePermissionStatsProps> = ({
  stats,
  maxShow = 3,
}) => {
  if (!stats || stats.length === 0) {
    return <span style={{ color: '#bfbfbf', fontSize: 13 }}>暂无权限</span>;
  }

  // 显示的统计项
  const visibleStats = stats.slice(0, maxShow);
  const hiddenCount = stats.length - maxShow;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {visibleStats.map((stat, index) => {
        const moduleName = moduleNames[stat.module] || stat.module;
        const moduleColor = moduleColors[stat.module] || '#666';

        return (
          <Tag
            key={index}
            style={{
              background: 'transparent',
              border: `1px solid ${moduleColor}20`,
              color: moduleColor,
              borderRadius: 4,
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {moduleName}
            <span
              style={{
                background: moduleColor,
                color: '#fff',
                padding: '0 6px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {stat.count}
            </span>
          </Tag>
        );
      })}
      {hiddenCount > 0 && (
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>
          +{hiddenCount}
        </span>
      )}
    </div>
  );
};

/**
 * 从权限列表生成统计数据
 * @param permissions 权限编码列表
 * @returns 按模块分组的统计
 */
export const generatePermissionStats = (permissions: string[]): PermissionStat[] => {
  const moduleCount: Record<string, number> = {};

  permissions.forEach(code => {
    const parts = code.split(':');
    if (parts.length > 0) {
      const module = parts[0];
      moduleCount[module] = (moduleCount[module] || 0) + 1;
    }
  });

  return Object.entries(moduleCount)
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count);
};

export default RolePermissionStats;
