/**
 * PDF 渲染服务
 * 复用舟谱打印插件的原生渲染引擎（template.css + new_template_page.js），
 * 在服务端通过 Playwright 渲染对账单 HTML 为 PDF。
 *
 * 架构：三层单例（HTTP 服务器 + 浏览器 + 预热页面）
 * - HTTP 服务器：进程级常驻，托管静态资源 + body-content 动态端点
 * - 浏览器：进程级 Chromium 单例，断线自动重建
 * - 预热页面：CSS/JS 只加载一次，后续渲染只替换 DOM 内容
 *
 * @module services/print-renderer
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('PrintRenderer');

import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright';

/** 静态资源目录（编译后的路径） */
const ASSETS_DIR = path.join(__dirname, 'assets');

// =====================================================
// 三层单例：HTTP 服务器 + 浏览器 + 预热页面
// =====================================================

/** 当前待渲染的 body HTML 内容（通过 HTTP 端点传递给浏览器） */
let pendingBodyContent = '';

/** HTTP 服务器单例 */
let staticServer: http.Server | null = null;
let staticPort = 0;
let serverInitPromise: Promise<number> | null = null;

/** 浏览器单例 */
let sharedBrowser: Browser | null = null;
let browserInitPromise: Promise<Browser> | null = null;



/**
 * 获取常驻 HTTP 服务器（懒初始化，首次启动后常驻）
 * 路由：/ → 包装页面, /body-content → 动态内容, 其他 → 静态资源
 */
async function getStaticServer(): Promise<number> {
  if (staticServer && staticServer.listening) {
    return staticPort;
  }
  if (serverInitPromise) {
    return serverInitPromise;
  }
  serverInitPromise = new Promise<number>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';

      // 根路径：返回包装页面
      if (url === '/' || url === '/?render=true') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateWrapperHtml());
        return;
      }

      // body-content 端点：返回当前待渲染的 HTML（避免嵌入 JS 字符串）
      if (url === '/body-content') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pendingBodyContent);
        return;
      }

      // 其他路径：从 assets/ 读取静态文件（含路径遍历防护）
      const rawPath = url.split('?')[0];
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
        staticServer = server;
        staticPort = addr.port;
        log.info(`[PrintRenderer] HTTP服务器单例就绪, port=${staticPort}`);
        resolve(staticPort);
      } else {
        serverInitPromise = null;
        reject(new Error('无法获取服务器端口'));
      }
    });

    server.on('error', (err) => {
      serverInitPromise = null;
      reject(err);
    });
  });
  return serverInitPromise;
}

/**
 * 获取共享浏览器实例（懒初始化 + 断线自动重建）
 */
async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }
  if (browserInitPromise) {
    return browserInitPromise;
  }
  log.info('[PrintRenderer] 创建浏览器单例...');
  const t0 = Date.now();
  browserInitPromise = chromium
    .launch({ headless: true })
    .then((browser) => {
      sharedBrowser = browser;
      browser.on('disconnected', () => {
        log.warn('[PrintRenderer] 浏览器单例断开，下次调用将重新创建');
        sharedBrowser = null;
        browserInitPromise = null;
      });
      log.info(`[PrintRenderer] 浏览器单例就绪, 启动耗时=${Date.now() - t0}ms`);
      return browser;
    })
    .catch((err) => {
      browserInitPromise = null;
      throw err;
    });
  return browserInitPromise;
}

/**
 * 创建渲染页面（每次新建 page，复用单例服务器和浏览器）
 * 新建 page 确保模板引擎状态干净，避免渲染结果互相干扰
 */
async function createRenderPage(): Promise<Page> {
  const port = await getStaticServer();
  const browser = await getSharedBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1123, height: 794 });

  // 注册诊断监听器
  page.on('pageerror', (err) => {
    log.error(`[PAGE_ERROR] ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      log.error(`[CONSOLE:error] ${msg.text()}`);
    }
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    log.warn(`[REQUEST_FAILED] ${req.url()} -> ${failure?.errorText || 'unknown'}`);
  });

  await page.goto(`http://127.0.0.1:${port}/?render=true`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  return page;
}

// =====================================================
// 常量
// =====================================================

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
 * 使用三层单例架构：HTTP 服务器常驻 + 浏览器复用 + 预热页面
 * body content 通过 HTTP 端点传递（避免嵌入 JS 字符串字面量）
 * 超时自适应：基础30s + 每100KB额外15s
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

  const t0 = Date.now();

  // 1. 将 body 内容放入 HTTP 端点（浏览器通过 fetch 获取，不再嵌入 JS）
  pendingBodyContent = bodyContent;

  // 2. 创建渲染页面（每次新建，复用服务器和浏览器）
  const page = await createRenderPage();

  // 3. 通过 evaluate 触发渲染（浏览器内 fetch /body-content 获取 HTML）
  const renderScript = `
    (async function() {
      var resp = await fetch('/body-content');
      var bodyHtml = await resp.text();
      var w = window;
      if (w.__renderCallback) {
        w.__renderCallback(
          { sender: { send: function() {} } },
          {
            content: {
              computedBody: bodyHtml,
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
  await page.evaluate(renderScript);

  // 4. 自适应超时：基础30s + 每100KB额外15s
  const contentKB = bodyContent.length / 1024;
  const adaptiveTimeout = Math.max(30000, 30000 + Math.ceil(contentKB / 100) * 15000);
  log.info(`自适应超时: ${adaptiveTimeout}ms (内容${Math.round(contentKB)}KB)`);

  try {
    await page.waitForFunction('window.__renderDone === true', {
      timeout: adaptiveTimeout,
    });
  } catch (timeoutErr) {
    // 超时时收集诊断信息
    const callbackExists = await page
      .evaluate('typeof window.__renderCallback === "function"')
      .catch(() => false);
    log.error(
      `[PDF渲染超时] __renderCallback已注册=${callbackExists}, ` +
      `超时=${adaptiveTimeout}ms, 内容=${Math.round(contentKB)}KB`
    );
    throw timeoutErr;
  }

  // 5. 导出 PDF
  const pdfBuffer = await page.pdf({
    width: `${pageWidth}mm`,
    height: `${pageHeight}mm`,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    printBackground: true,
  });

  // 6. 清理 body 内容（释放内存）
  pendingBodyContent = '';

  log.info(`PDF渲染完成, 总耗时=${Date.now() - t0}ms, 大小=${pdfBuffer.length}bytes`);
  const result = Buffer.from(pdfBuffer);

  // 关闭本次渲染的 page（服务器和浏览器单例保持存活）
  await page.close().catch(() => {});
  return result;
}

// =====================================================
// 内部实现
// =====================================================

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
