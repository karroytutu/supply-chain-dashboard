/**
 * 探测 ERP 片区 API 原始树形结构
 * 运行: cd dev/backend && npx ts-node scripts/probe-area-tree.ts
 *
 * 目的：查看 /redcoast/store-area-query/query-list 接口返回的原始树形数据，
 *       确认 children 字段的嵌套方式、节点字段名、树的深度等。
 */
import { erpPost, extractErpData } from '../src/services/erp-client/erp-client';
import { getErpDefaults } from '../src/services/erp-client/erp-config';
import { closeAppPool } from '../src/db/appPool';

/** 递归统计树的深度 */
function getTreeDepth(nodes: any[]): number {
  if (!nodes || nodes.length === 0) return 0;
  return 1 + Math.max(...nodes.map(n => getTreeDepth(n.children ?? [])));
}

/** 递归统计节点总数 */
function countNodes(nodes: any[]): number {
  if (!nodes || nodes.length === 0) return 0;
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);
}

/** 递归收集各层级的节点数量 */
function collectLevelCounts(nodes: any[], level = 0, counts: number[] = []): number[] {
  if (!nodes || nodes.length === 0) return counts;
  counts[level] = (counts[level] ?? 0) + nodes.length;
  for (const node of nodes) {
    collectLevelCounts(node.children ?? [], level + 1, counts);
  }
  return counts;
}

/** 递归打印树形结构（最多打印前 N 个节点） */
function printTree(nodes: any[], indent = '', maxPrint = 20, printed = { count: 0 }): void {
  if (!nodes || nodes.length === 0) return;
  for (const node of nodes) {
    if (printed.count >= maxPrint) {
      console.log(`${indent}... (省略更多节点)`);
      return;
    }
    const childCount = node.children?.length ?? 0;
    const childInfo = childCount > 0 ? ` [${childCount} children]` : ' (leaf)';
    console.log(`${indent}- id=${JSON.stringify(node.id)}, name=${JSON.stringify(node.name)}${childInfo}`);
    printed.count++;
    if (childCount > 0) {
      printTree(node.children, indent + '  ', maxPrint, printed);
    }
  }
}

async function main() {
  console.log('=== ERP 片区 API 树形结构探测 ===\n');
  console.log('开始时间:', new Date().toLocaleString('zh-CN'));
  console.log('');

  try {
    const { cid, uid } = getErpDefaults();
    console.log(`使用 cid=${cid}, uid=${uid}`);
    console.log(`请求: POST /redcoast/store-area-query/query-list\n`);

    // 直接调用 ERP API，不做展平处理
    const rawResponse = await erpPost<unknown>(
      '/store-area-query/query-list',
      { cid, uid },
      { pathPrefix: '/redcoast/', businessType: 'area_tree_probe', skipLog: false }
    );

    // 打印原始响应（截取前 5000 字符）
    const rawStr = JSON.stringify(rawResponse, null, 2);
    console.log('========== 原始响应（前5000字符） ==========');
    console.log(rawStr.substring(0, 5000));
    if (rawStr.length > 5000) {
      console.log(`\n... (共 ${rawStr.length} 字符，已截断)\n`);
    }

    // 提取 data 字段
    const rawData = extractErpData<unknown>(rawResponse);
    const items = Array.isArray(rawData) ? rawData : [rawData];

    console.log('\n========== 树形结构分析 ==========');
    console.log(`顶层节点数: ${items.length}`);
    console.log(`总节点数: ${countNodes(items)}`);
    console.log(`树深度: ${getTreeDepth(items)}`);
    console.log(`各层节点数:`, collectLevelCounts(items));

    // 分析节点字段（取第一个节点）
    if (items.length > 0) {
      const sampleNode = items[0];
      console.log(`\n节点字段名: ${Object.keys(sampleNode).join(', ')}`);
      console.log(`示例节点:`, JSON.stringify(sampleNode, null, 2).substring(0, 500));
    }

    // 打印树形结构（最多前30个节点）
    console.log('\n========== 树形结构预览（前30个节点） ==========');
    printTree(items, '', 30);

    console.log('\n探测完成!');
  } catch (error) {
    console.error('\n探测失败:', error);
  } finally {
    console.log('\n结束时间:', new Date().toLocaleString('zh-CN'));
    await closeAppPool().catch(() => {});
    process.exit(0);
  }
}

main();
