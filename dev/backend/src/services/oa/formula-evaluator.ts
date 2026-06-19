/**
 * 公式求值器
 * 支持四则运算、变量引用、聚合函数（sum/count/avg/min/max）
 * 自建轻量实现，不引入第三方库（expr-eval 存在 CVE-2025-12735）
 *
 * ⚠️ SYNC-WITH: dev/frontend/src/utils/formula-evaluator.ts
 * 前后端必须保持完全一致，修改任一方时务必同步另一方
 *
 * @module services/oa/formula-evaluator
 */

/** 公式求值上下文：顶层 formData 或表格行数据 */
export type FormulaContext = Record<string, unknown>;

// =====================================================
// AST 节点定义（内部使用，不导出）
// =====================================================

interface NumberNode { type: 'number'; value: number }
interface VariableNode { type: 'variable'; name: string; property?: string }
interface BinaryNode { type: 'binary'; op: string; left: ASTNode; right: ASTNode }
interface FunctionNode { type: 'function'; name: string; arg: ASTNode }
interface UnaryNode { type: 'unary'; op: string; operand: ASTNode }

type ASTNode = NumberNode | VariableNode | BinaryNode | FunctionNode | UnaryNode;

interface Token { type: 'number' | 'identifier' | 'op' | 'lparen' | 'rparen' | 'comma' | 'dot'; value: string }

const BUILTIN_FUNCTIONS = new Set(['sum', 'count', 'avg', 'min', 'max']);

// =====================================================
// Tokenizer（词法分析器）
// =====================================================

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // 跳过空白
    if (/\s/.test(ch)) { i++; continue; }

    // 数字字面量（含小数）
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < len && /[0-9]/.test(input[i])) num += input[i++];
      if (i < len && input[i] === '.' && i + 1 < len && /[0-9]/.test(input[i + 1])) {
        num += input[i++];
        while (i < len && /[0-9]/.test(input[i])) num += input[i++];
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // 标识符（变量名 / 函数名），支持字母、数字、下划线、$
    if (/[a-zA-Z_$]/.test(ch)) {
      let id = '';
      while (i < len && /[a-zA-Z0-9_$]/.test(input[i])) id += input[i++];
      tokens.push({ type: 'identifier', value: id });
      continue;
    }

    // 单字符运算符和分隔符
    if ('+-*/'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen', value: ch }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ch }); i++; continue; }
    if (ch === '.') { tokens.push({ type: 'dot', value: ch }); i++; continue; }

    throw new Error(`公式中包含非法字符: "${ch}" (位置 ${i})`);
  }

  return tokens;
}

// =====================================================
// Parser（递归下降解析器）
// =====================================================

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  parse(): ASTNode {
    if (this.tokens.length === 0) throw new Error('公式为空');
    const ast = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`公式解析异常，多余内容: "${this.tokens[this.pos].value}"`);
    }
    return ast;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  /** 加减法层（最低优先级） */
  private parseExpression(): ASTNode {
    let left = this.parseTerm();
    while (this.peek()?.type === 'op' && (this.peek()!.value === '+' || this.peek()!.value === '-')) {
      const op = this.consume().value;
      left = { type: 'binary', op, left, right: this.parseTerm() };
    }
    return left;
  }

  /** 乘除法层 */
  private parseTerm(): ASTNode {
    let left = this.parseUnary();
    while (this.peek()?.type === 'op' && (this.peek()!.value === '*' || this.peek()!.value === '/')) {
      const op = this.consume().value;
      left = { type: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  /** 一元运算符（负号） */
  private parseUnary(): ASTNode {
    if (this.peek()?.type === 'op' && this.peek()!.value === '-') {
      this.consume();
      return { type: 'unary', op: '-', operand: this.parseUnary() };
    }
    if (this.peek()?.type === 'op' && this.peek()!.value === '+') {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  /** 基本表达式：数字、变量、函数调用、括号 */
  private parsePrimary(): ASTNode {
    const tok = this.peek();
    if (!tok) throw new Error('公式意外结束');

    // 括号表达式
    if (tok.type === 'lparen') {
      this.consume();
      const node = this.parseExpression();
      const closing = this.consume();
      if (!closing || closing.type !== 'rparen') throw new Error('公式缺少右括号 )');
      return node;
    }

    // 数字
    if (tok.type === 'number') {
      this.consume();
      return { type: 'number', value: parseFloat(tok.value) };
    }

    // 标识符（变量 / 函数）
    if (tok.type === 'identifier') {
      this.consume();
      const name = tok.value;

      // 聚合函数调用：sum(expr) / count(expr) 等
      if (BUILTIN_FUNCTIONS.has(name) && this.peek()?.type === 'lparen') {
        this.consume(); // 消费 (
        const arg = this.parseExpression(); // 支持 tableKey.columnKey（解析为 VariableNode + property）
        const closing = this.consume();
        if (!closing || closing.type !== 'rparen') throw new Error(`函数 ${name}() 缺少右括号`);
        return { type: 'function', name, arg };
      }

      // 点访问：variable.property（用于聚合函数参数的 tableKey.columnKey 语法）
      if (this.peek()?.type === 'dot') {
        this.consume();
        const prop = this.consume();
        if (!prop || prop.type !== 'identifier') throw new Error(`"${name}." 后面期望一个字段名`);
        return { type: 'variable', name, property: prop.value };
      }

      return { type: 'variable', name };
    }

    throw new Error(`公式中出现意外内容: "${tok.value}"`);
  }
}

// =====================================================
// AST 求值器
// =====================================================

function evaluateAST(node: ASTNode, ctx: FormulaContext): number {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'variable': {
      const val = ctx[node.name];
      // 点访问：ctx[name].property（用于行数据对象的属性访问）
      if (node.property && val != null && typeof val === 'object') {
        const propVal = (val as Record<string, unknown>)[node.property];
        return propVal != null && !isNaN(Number(propVal)) ? Number(propVal) : 0;
      }
      if (val == null || val === '') return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    }

    case 'unary':
      if (node.op === '-') return -evaluateAST(node.operand, ctx);
      return evaluateAST(node.operand, ctx);

    case 'binary': {
      const left = evaluateAST(node.left, ctx);
      const right = evaluateAST(node.right, ctx);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? 0 : left / right; // 除零保护
        default: return 0;
      }
    }

    case 'function': {
      const values = collectArrayValues(node.arg, ctx);
      switch (node.name) {
        case 'sum':   return values.reduce((a, b) => a + b, 0);
        case 'count': return values.length;
        case 'avg':   return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        case 'min':   return values.length > 0 ? Math.min(...values) : 0;
        case 'max':   return values.length > 0 ? Math.max(...values) : 0;
        default:      return 0;
      }
    }
  }
}

/** 从 AST 变量节点提取数组值（聚合函数使用） */
function collectArrayValues(node: ASTNode, ctx: FormulaContext): number[] {
  if (node.type !== 'variable' || !node.property) return [];
  const arr = ctx[node.name];
  if (!Array.isArray(arr)) return [];
  return arr
    .map(row => {
      if (row == null || typeof row !== 'object') return 0;
      const val = (row as Record<string, unknown>)[node.property!];
      if (val == null || val === '') return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    });
}

// =====================================================
// 公共 API
// =====================================================

/**
 * 计算表达式的值
 * @param expression 公式字符串，如 "quantity * unitPrice" 或 "sum(lines.amount)"
 * @param context   变量上下文（顶层 formData 或表格行数据）
 * @returns 计算结果（始终返回数字）
 */
export function evaluateFormula(expression: string, context: FormulaContext): number {
  try {
    const tokens = tokenize(expression);
    const ast = new Parser(tokens).parse();
    const result = evaluateAST(ast, context);
    return isNaN(result) || !isFinite(result) ? 0 : result;
  } catch (e) {
    console.warn(`公式计算失败: "${expression}"`, e);
    return 0;
  }
}

/**
 * 提取公式中引用的变量 key 列表
 * 例如 "quantity * unitPrice + sum(lines.amount)" → ["quantity", "unitPrice", "lines"]
 */
export function extractDependencies(expression: string): string[] {
  try {
    const tokens = tokenize(expression);
    const ast = new Parser(tokens).parse();
    const deps = new Set<string>();
    collectDeps(ast, deps);
    return Array.from(deps);
  } catch {
    return [];
  }
}

function collectDeps(node: ASTNode, deps: Set<string>): void {
  switch (node.type) {
    case 'variable':
      deps.add(node.name); // 顶层 key（对于 sum(lines.col)，添加 "lines"）
      break;
    case 'binary':
      collectDeps(node.left, deps);
      collectDeps(node.right, deps);
      break;
    case 'unary':
      collectDeps(node.operand, deps);
      break;
    case 'function':
      collectDeps(node.arg, deps);
      break;
  }
}

/**
 * 检测公式字段之间的循环依赖
 * @param formulas 公式字段数组，每项含 key 和表达式
 * @returns 发现环时返回涉及的 key 列表，无环返回 null
 */
export function detectCycles(formulas: Array<{ key: string; expression: string }>): string[] | null {
  const depMap = new Map<string, string[]>();
  const formulaKeys = new Set(formulas.map(f => f.key));

  for (const f of formulas) {
    const deps = extractDependencies(f.expression).filter(d => formulaKeys.has(d));
    depMap.set(f.key, deps);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleKeys: string[] = [];

  function dfs(node: string): boolean {
    if (inStack.has(node)) { cycleKeys.push(node); return true; }
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const dep of depMap.get(node) || []) {
      if (dfs(dep)) return true;
    }
    inStack.delete(node);
    return false;
  }

  for (const f of formulas) {
    if (dfs(f.key)) return cycleKeys;
  }
  return null;
}

/**
 * 拓扑排序公式字段（依赖顺序求值）
 * @param formulas 公式字段数组
 * @returns 按依赖顺序排列的公式字段数组（依赖少的在前）
 */
export function topologicalSort<T extends { key: string; expression: string }>(formulas: T[]): T[] {
  const formulaKeys = new Set(formulas.map(f => f.key));
  const depMap = new Map<string, string[]>();

  for (const f of formulas) {
    depMap.set(f.key, extractDependencies(f.expression).filter(d => formulaKeys.has(d)));
  }

  const visited = new Set<string>();
  const result: T[] = [];

  function visit(key: string): void {
    if (visited.has(key)) return;
    visited.add(key);
    for (const dep of depMap.get(key) || []) visit(dep);
    const item = formulas.find(f => f.key === key);
    if (item) result.push(item);
  }

  for (const f of formulas) visit(f.key);
  return result;
}
