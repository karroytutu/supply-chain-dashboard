/**
 * 树形弹窗选择器控件（tree_select 类型）
 * @module components/Oa/fields/TreeSelectModalControl
 *
 * 配置驱动的树形选择弹窗：支持父子联动勾选、搜索高亮、展开匹配节点
 * 用于片区等层级数据的多选场景
 */
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Modal, Tree, Input, Empty, Spin, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { FieldControlProps } from './types';
import { useEditableForm } from '../EditableFormContext';
import { getErpReference } from '@/services/api/oa';
import { isAbortError } from '@/services/api/request';
import { ERP_TREE_SEARCH_API_MAP } from '@/constants/oa-erp';

const { Text } = Typography;

// =====================================================
// 类型定义
// =====================================================

/** 树节点（后端返回） */
interface TreeNode {
  id: number | string;
  name: string;
  children?: TreeNode[];
}

// =====================================================
// 辅助函数
// =====================================================

/** TreeNode[] → antd DataNode[] */
function toDataNodes(nodes: TreeNode[]): DataNode[] {
  return nodes.map(node => ({
    key: node.id,
    title: node.name,
    children: node.children?.length ? toDataNodes(node.children) : undefined,
    isLeaf: !node.children?.length,
  }));
}

/** 递归遍历树，对每个节点执行回调 */
function walkTree(nodes: TreeNode[], cb: (node: TreeNode, parentPath: TreeNode[]) => void, parentPath: TreeNode[] = []) {
  for (const node of nodes) {
    cb(node, parentPath);
    if (node.children?.length) {
      walkTree(node.children, cb, [...parentPath, node]);
    }
  }
}

/** 获取所有节点 key */
function getAllKeys(nodes: TreeNode[]): React.Key[] {
  const keys: React.Key[] = [];
  walkTree(nodes, (node) => keys.push(node.id));
  return keys;
}

/** 构建 id → TreeNode 映射 */
function buildNodeMap(nodes: TreeNode[]): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>();
  walkTree(nodes, (node) => map.set(String(node.id), node));
  return map;
}

/**
 * 从树中收集被勾选的叶子节点 ID
 * antd Tree checkable 模式下 checkedKeys 包含所有被勾选的叶子节点
 */
function collectLeafIds(tree: TreeNode[], checkedKeys: React.Key[]): (number | string)[] {
  const checkedSet = new Set(checkedKeys.map(String));
  const leafIds: (number | string)[] = [];
  walkTree(tree, (node) => {
    if (!node.children?.length && checkedSet.has(String(node.id))) {
      leafIds.push(node.id);
    }
  });
  return leafIds;
}

/**
 * 将可能包含非叶子节点 ID 的值展开为纯叶子 ID（回显用）
 * antd Tree checkable 要求 checkedKeys 为叶子节点才能正确显示
 */
function expandToLeafIds(tree: TreeNode[], ids: React.Key[]): React.Key[] {
  const idSet = new Set(ids.map(String));
  const leafIds: React.Key[] = [];

  function walk(nodes: TreeNode[], ancestorMatched: boolean) {
    for (const node of nodes) {
      const isMatched = ancestorMatched || idSet.has(String(node.id));
      if (!node.children?.length) {
        // 叶子节点：如果自身或任一祖先被选中，则纳入
        if (isMatched) leafIds.push(node.id);
      } else {
        walk(node.children, isMatched);
      }
    }
  }
  walk(tree, false);
  return leafIds;
}

/**
 * 搜索：获取匹配节点的所有父级 key（用于自动展开）
 */
function getParentKeys(nodes: TreeNode[], searchValue: string, parentKeys: React.Key[] = []): React.Key[] {
  const result: React.Key[] = [];
  const lowerSearch = searchValue.toLowerCase();
  for (const node of nodes) {
    const match = node.name.toLowerCase().includes(lowerSearch);
    if (match) {
      result.push(...parentKeys);
    }
    if (node.children?.length) {
      result.push(...getParentKeys(node.children, searchValue, [...parentKeys, node.id]));
    }
  }
  return [...new Set(result)];
}

/**
 * 搜索：获取匹配的节点 key（用于高亮）
 */
function getMatchedKeys(nodes: TreeNode[], searchValue: string): Set<React.Key> {
  const result = new Set<React.Key>();
  const lowerSearch = searchValue.toLowerCase();
  walkTree(nodes, (node) => {
    if (node.name.toLowerCase().includes(lowerSearch)) {
      result.add(node.id);
    }
  });
  return result;
}

// =====================================================
// 组件
// =====================================================

const TreeSelectModalControl: React.FC<FieldControlProps> = ({
  mode, field, value, onChange, formData,
}) => {
  const editableForm = useEditableForm();
  const { valueKey = 'id', labelKey = 'name' } = field;

  // 当前表单值（ID 数组）
  const selectedIds: unknown[] = useMemo(() => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) return value.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }, [value]);

  const [modalOpen, setModalOpen] = useState(false);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [rawTree, setRawTree] = useState<TreeNode[]>([]);
  const [nodeMap, setNodeMap] = useState<Map<string, TreeNode>>(new Map());
  const [loading, setLoading] = useState(false);
  const [draftKeys, setDraftKeys] = useState<React.Key[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [matchedKeys, setMatchedKeys] = useState<Set<React.Key>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const dataLoadedRef = useRef(false);
  const treeDataRequestedRef = useRef(false);

  // 加载树数据
  const fetchTreeData = useCallback(async () => {
    if (dataLoadedRef.current) return;
    const treeSearchApi = field.treeSearchApi;
    if (!treeSearchApi) return;

    const erpType = ERP_TREE_SEARCH_API_MAP[treeSearchApi];
    if (!erpType) return;

    setLoading(true);
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const result = await getErpReference(erpType, undefined, undefined, abortRef.current.signal);
      const tree = (result || []) as unknown as TreeNode[];
      setRawTree(tree);
      setTreeData(toDataNodes(tree));
      setNodeMap(buildNodeMap(tree));
      // 默认展开第一层
      const firstLevelKeys = tree.map(n => n.id);
      setExpandedKeys(firstLevelKeys);
      dataLoadedRef.current = true;
    } catch (err) {
      if (!isAbortError(err)) {
        console.error('获取片区树形数据失败:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [field.treeSearchApi]);

  // 打开弹窗
  const openModal = () => {
    // 将当前值展开为叶子节点 ID
    const leafKeys = rawTree.length > 0
      ? expandToLeafIds(rawTree, selectedIds.map(id => id as React.Key))
      : selectedIds.map(id => id as React.Key);
    setDraftKeys(leafKeys);
    setSearchValue('');
    setMatchedKeys(new Set());
    setModalOpen(true);
    if (!dataLoadedRef.current) fetchTreeData();
  };

  // 确认选择
  const handleConfirm = () => {
    // 收集叶子节点 ID 作为提交值
    const leafIds = collectLeafIds(rawTree, draftKeys);
    onChange?.(leafIds);

    // 持久化到 formData._details
    if (editableForm) {
      const records = leafIds
        .map(id => nodeMap.get(String(id)))
        .filter(Boolean)
        .map(node => ({ [valueKey]: node!.id, [labelKey]: node!.name }));
      const existingDetails = (editableForm.getFieldValue('_details') as Record<string, unknown>) || {};
      if (records.length > 0) {
        editableForm.setFieldsValue({
          _details: { ...existingDetails, [field.key]: records },
        });
      } else {
        const { [field.key]: _, ...rest } = existingDetails;
        editableForm.setFieldsValue({ _details: rest });
      }
    }
    setModalOpen(false);
  };

  // 搜索处理（300ms debounce）
  const handleSearch = (val: string) => {
    setSearchValue(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (!val.trim()) {
        setMatchedKeys(new Set());
        return;
      }
      const parentKeys = getParentKeys(rawTree, val);
      const matched = getMatchedKeys(rawTree, val);
      setExpandedKeys(prev => [...new Set([...prev, ...parentKeys])]);
      setAutoExpandParent(true);
      setMatchedKeys(matched);
    }, 300);
  };

  // 展开全部 / 收起全部
  const handleExpandAll = () => setExpandedKeys(getAllKeys(rawTree));
  const handleCollapseAll = () => setExpandedKeys([]);

  // 树节点标题渲染（搜索高亮）
  const titleRender = (nodeData: DataNode) => {
    const title = String(nodeData.title);
    if (!searchValue.trim()) return title;

    const lowerTitle = title.toLowerCase();
    const lowerSearch = searchValue.toLowerCase();
    const idx = lowerTitle.indexOf(lowerSearch);
    if (idx === -1) return title;

    const before = title.slice(0, idx);
    const match = title.slice(idx, idx + searchValue.length);
    const after = title.slice(idx + searchValue.length);
    return (
      <span>
        {before}
        <span style={{ color: '#f5222d', fontWeight: 500 }}>{match}</span>
        {after}
      </span>
    );
  };

  // 已选记录的名称列表（用于展示，依赖内存缓存 nodeMap）
  const selectedRecords = useMemo(() => {
    if (selectedIds.length === 0) return [];
    return selectedIds
      .map(id => nodeMap.get(String(id)))
      .filter(Boolean) as TreeNode[];
  }, [selectedIds, nodeMap]);

  // 从 _details 读取持久化记录（控件重建后 nodeMap 为空时的兜底）
  // 用户在弹窗中确认选择时，系统已将完整记录（ID+名称）存入 formData._details[field.key]
  const detailsRecords = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const detailsData = (formData as Record<string, unknown> | undefined)?._details as Record<string, unknown> | undefined;
    const records = detailsData?.[field.key] as Record<string, unknown>[] | undefined;
    return records || [];
  }, [selectedIds, formData, field.key]);

  // 已选叶子数量
  const selectedLeafCount = useMemo(() => {
    if (selectedIds.length === 0 || rawTree.length === 0) return selectedIds.length;
    return selectedIds.filter(id => {
      const node = nodeMap.get(String(id));
      return node && !node.children?.length;
    }).length;
  }, [selectedIds, rawTree, nodeMap]);

  // 控件挂载/值到达时，如果有已选值但树数据未加载，自动加载树数据
  // 监听 selectedIds 变化：确保即使控件挂载时值尚未传入，后续值到达时也能触发加载
  useEffect(() => {
    if (selectedIds.length > 0 && !dataLoadedRef.current && !treeDataRequestedRef.current) {
      treeDataRequestedRef.current = true;
      fetchTreeData();
    }
  }, [selectedIds, fetchTreeData]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // ==================== 只读模式 ====================
  if (mode === 'readonly') {
    // 从 formData._details 读取持久化的记录
    const detailsData = (formData as Record<string, unknown> | undefined)?._details as Record<string, unknown> | undefined;
    const records = detailsData?.[field.key] as Record<string, unknown>[] | undefined;

    if (records && records.length > 0) {
      return (
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: '2px 8px 2px 0' }}>{String(r[labelKey] || r[valueKey] || '-')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (selectedRecords.length > 0) {
      return (
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {selectedRecords.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: '2px 8px 2px 0' }}>{r.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (selectedIds.length === 0) {
      return <Text type="secondary">-</Text>;
    }

    // 降级：显示原始 ID
    return <Text>{Array.isArray(value) ? value.join(', ') : String(value)}</Text>;
  }

  // ==================== 编辑模式 ====================
  return (
    <>
      <div
        style={{
          minHeight: 32,
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          background: '#fff',
        }}
        onClick={openModal}
      >
        {selectedIds.length === 0 ? (
          <span style={{ color: '#bfbfbf' }}>请选择</span>
        ) : (
          <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {selectedRecords.length > 0
                ? selectedRecords.map((r, i) => (
                    <tr key={i}><td style={{ padding: '2px 8px 2px 0' }}>{r.name}</td></tr>
                  ))
                : detailsRecords.length > 0
                  ? detailsRecords.map((r, i) => (
                      <tr key={i}><td style={{ padding: '2px 8px 2px 0' }}>{String(r[labelKey] || r[valueKey] || '-')}</td></tr>
                    ))
                  : selectedIds.map((id, i) => (
                      <tr key={i}><td style={{ padding: '2px 8px 2px 0' }}>{String(id)}</td></tr>
                    ))
              }
            </tbody>
          </table>
        )}
      </div>
      {selectedLeafCount > 0 && (
        <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
          已选 {selectedLeafCount} 个片区
        </div>
      )}

      <Modal
        title={field.label || '选择'}
        open={modalOpen}
        width={560}
        onCancel={() => setModalOpen(false)}
        onOk={handleConfirm}
        okText="确定"
        cancelText="取消"
        footer={(originNode) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#666' }}>
              已选 {draftKeys.length > 0 ? collectLeafIds(rawTree, draftKeys).length : 0} 个片区
            </span>
            {originNode}
          </div>
        )}
      >
        {/* 搜索栏 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input
            placeholder={field.searchPlaceholder || '搜索片区'}
            allowClear
            value={searchValue}
            onChange={e => handleSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <a onClick={handleExpandAll} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>展开</a>
          <a onClick={handleCollapseAll} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>收起</a>
        </div>

        {/* 搜索统计 */}
        {searchValue.trim() && (
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
            找到 {matchedKeys.size} 个匹配项
          </div>
        )}

        {/* 树形控件 */}
        <Spin spinning={loading}>
          {treeData.length > 0 ? (
            <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
              <Tree
                checkable
                checkStrictly={false}
                checkedKeys={draftKeys}
                onCheck={(checked) => {
                  // antd Tree checkable 模式：checked 为 React.Key[] 或 { checked, halfChecked }
                  const keys = Array.isArray(checked) ? checked : checked.checked;
                  setDraftKeys(keys);
                }}
                expandedKeys={expandedKeys}
                autoExpandParent={autoExpandParent}
                onExpand={(keys) => {
                  setExpandedKeys(keys);
                  setAutoExpandParent(false);
                }}
                treeData={treeData}
                titleRender={titleRender}
                blockNode
              />
            </div>
          ) : !loading ? (
            <Empty description="暂无片区数据" style={{ padding: 32 }} />
          ) : null}
        </Spin>
      </Modal>
    </>
  );
};

export default TreeSelectModalControl;
