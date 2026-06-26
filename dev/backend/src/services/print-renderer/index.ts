/**
 * PDF 渲染服务
 * 复用舟谱打印插件的原生渲染引擎（template.css + new_template_page.js），
 * 在服务端通过 Playwright 渲染对账单 HTML 为 PDF。
 *
 * 渲染流程：
 * 1. 启动临时 HTTP 服务器，托管打印插件的 CSS/JS 静态资源
 * 2. 构造包装 HTML 页面：mock window.electronAPI，加载插件 CSS/JS
 * 3. Playwright 加载页面，触发 mock 的 onRenderPrint 回调
 * 4. 等待 finishPageRenderFromPreview 信号（分页/小计/页码由插件代码处理）
 * 5. 导出 PDF 并返回 Buffer
 *
 * @module services/print-renderer
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('PrintRenderer');

import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium, type Browser } from 'playwright';

/** 静态资源目录（编译后的路径） */
const ASSETS_DIR = path.join(__dirname, 'assets');

/** MIME 类型映射 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/** PDF 渲染参数 */
interface RenderParams {
  /** 对账单 HTML 模板的 body 内容（从 ERP 打印接口获取） */
  bodyContent: string;
  /** 页面宽度（mm），默认 297（A4横向） */
  pageWidth?: number;
  /** 页面高度（mm），默认 210（A4横向） */
  pageHeight?: number;
  /** 页边距（mm），默认 5 */
  pageMargin?: number;
}

/**
 * 渲染对账单 HTML 为 PDF
 *
 * @param params - 渲染参数
 * @returns PDF 文件 Buffer
 */
export async function renderStatementPdf(params: RenderParams): Promise<Buffer> {
  const {
    bodyContent,
    pageWidth = 297,
    pageHeight = 210,
    pageMargin = 5,
  } = params;

  let server: http.Server | null = null;
  let browser: Browser | null = null;
  let port = 0;

  try {
    // 1. 启动临时 HTTP 服务器
    port = await startStaticServer();
    log.info(`静态资源服务器启动: port=${port}`);

    // 2. 启动 Playwright
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1123, height: 794 });

    // 2.5 捕获页面内 JS 错误和日志（诊断渲染失败的关键信息）
    const pageErrors: string[] = [];
    const consoleMessages: string[] = [];
    const failedRequests: string[] = [];

    page.on('pageerror', (err) => {
      const msg = `[PAGE_ERROR] ${err.message}`;
      pageErrors.push(msg);
      log.error(msg);
    });
    page.on('console', (msg) => {
      const text = `[CONSOLE:${msg.type()}] ${msg.text()}`;
      consoleMessages.push(text);
      if (msg.type() === 'error') log.error(text);
    });
    page.on('requestfailed', (req) => {
      const failure = req.failure();
      const msg = `[REQUEST_FAILED] ${req.url()} -> ${failure?.errorText || 'unknown'}`;
      failedRequests.push(msg);
      log.warn(msg);
    });

    // 3. 加载包装页面
    const wrapperUrl = `http://127.0.0.1:${port}/?render=true`;
    await page.goto(wrapperUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // 4. 注入渲染触发脚本（通过 addScriptTag 避免 TS 编译期 window 引用问题）
    const renderScript = `
      (function() {
        var w = window;
        if (w.__renderCallback) {
          w.__renderCallback(
            { sender: { send: function() {} } },
            {
              content: {
                computedBody: ${JSON.stringify(bodyContent)},
                pageSize: { width: ${pageWidth}, height: ${pageHeight} },
                allPagesRange: null
              },
              batchId: 'statement-pdf',
              pageIndex: 0,
              fromPreView: true,
              isPreview: true,
              isBreakWord: false,
              printType: 'bill',
              MM_TO_PX: 3.7795275590551185,
              pageMargin: { top: ${pageMargin}, bottom: ${pageMargin}, left: ${pageMargin}, right: ${pageMargin} },
              landscape: true,
              allPages: null,
              printSetting: {
                zoomOutFont: '0', zoomOutFontSize: '10',
                useSelfMargin: '0', usePrintTotalSum: '1',
                usePrintTableHead: '1', exportExcel: '0',
                exportMode: '0', printAllPages: '1',
                forcedPageBreak: '0'
              },
              printConfig: {},
              isAllPage: true,
              pageRanges: null
            }
          );
        }
      })();
    `;
    await page.addScriptTag({ content: renderScript });

    // 5. 等待渲染完成
    try {
      await page.waitForFunction('window.__renderDone === true', {
        timeout: 15000,
      });
    } catch (timeoutErr) {
      // 超时时输出所有捕获的诊断信息
      log.error(`[PDF渲染超时] 页面错误: ${pageErrors.length}条, 控制台消息: ${consoleMessages.length}条, 失败请求: ${failedRequests.length}条`);
      if (pageErrors.length > 0) log.error(`[PDF渲染诊断] 页面错误详情:\n${pageErrors.join('\n')}`);
      if (consoleMessages.length > 0) log.info(`[PDF渲染诊断] 控制台消息:\n${consoleMessages.join('\n')}`);
      if (failedRequests.length > 0) log.warn(`[PDF渲染诊断] 失败请求:\n${failedRequests.join('\n')}`);

      // 检查 __renderCallback 是否被注册
      const callbackExists = await page.evaluate('typeof window.__renderCallback === "function"').catch(() => false);
      log.error(`[PDF渲染诊断] __renderCallback已注册: ${callbackExists}`);

      throw timeoutErr;
    }
    log.info('渲染完成');

    // 6. 导出 PDF
    const pdfBuffer = await page.pdf({
      width: `${pageWidth}mm`,
      height: `${pageHeight}mm`,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    // 7. 清理
    if (browser) await browser.close().catch(() => {});
    if (server) (server as http.Server).close();
    if (port) log.info(`静态资源服务器关闭: port=${port}`);
  }
}

// =====================================================
// 内部实现
// =====================================================

/**
 * 启动静态资源服务器
 * 根路径返回包装 HTML 页面，其他路径返回 assets/ 下的文件
 * @returns 分配的端口号
 */
function startStaticServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // 根路径：返回包装页面
      if (req.url === '/' || req.url === '/?render=true') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateWrapperHtml());
        return;
      }

      // 其他路径：从 assets/ 读取文件（含路径遍历防护）
      const rawPath = req.url!.split('?')[0];
      const filePath = path.resolve(ASSETS_DIR, '.' + rawPath);
      if (!filePath.startsWith(ASSETS_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const ext = path.extname(filePath);

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('无法获取服务器端口'));
      }
    });

    // 保存 server 引用以便清理
    (startStaticServer as any)._server = server;
  });
}

/**
 * 生成包装 HTML 页面
 * mock window.electronAPI 以替代 Electron IPC 通信
 */
function generateWrapperHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="./new_template/styles/template.css">
  <link href="./css/new_print.css" rel="stylesheet">
  <style id="styleSelf"></style>
  <script>
    // Mock electronAPI - 替代 Electron IPC 通信
    window.__renderDone = false;
    window.electronAPI = {
      onRenderPrint: function(callback) {
        window.__renderCallback = callback;
      },
      finishPageRenderFromPreview: function(data) {
        window.__renderDone = true;
      },
      finishPageRender: function(data) {
        window.__renderDone = true;
      },
      onSelectPrintPage: function() {},
    };
    // Mock logger
    window.logger = { log: function() {} };
  </script>
  <script src="./new_template/scripts/barcode.js"></script>
  <script src="./new_template/scripts/qrcode.js"></script>
  <script src="./new_template/scripts/template.js"></script>
</head>
<body>
<div id="container"></div>
<script src="./js/new_tools.js"></script>
<script src="./js/new_template_page.js"></script>
</body>
</html>`;
}
