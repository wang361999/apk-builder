/**
 * ET Studio 授权验证 SDK
 *
 * 供其他项目嵌入使用，验证授权码是否有效。
 *
 * 使用方式：
 *
 * 1. 安装（Node.js 项目）：
 *    npm install node-fetch  # Node 18+ 已内置 fetch，无需安装
 *    将本文件复制到项目中
 *
 * 2. 初始化：
 *    const { initLicense } = require('./license-verifier');
 *    await initLicense({
 *      licenseKey: 'ET-XXXXXXXX-XXXXXXXX-XXXXXXXX',
 *      verifyUrl: 'https://your-domain.com/api/license/verify',
 *    });
 *
 * 3. 在 Next.js 中间件中使用（middleware.ts）：
 *    import { verifyLicense } from './license-verifier';
 *    // 在需要保护的路由中调用 verifyLicense()
 *
 * 4. 定时校验（运行期间每 24 小时）：
 *    const { startPeriodicCheck } = require('./license-verifier');
 *    startPeriodicCheck();  // 启动后自动每 24 小时验证一次
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const CONFIG = {
  licenseKey: '',
  verifyUrl: '',
  cachePath: path.join(process.cwd(), '.license-cache.json'),
  checkInterval: 24 * 60 * 60 * 1000, // 24 小时
  requestTimeout: 10000, // 10 秒超时
};

// ============ 运行时状态 ============
let isVerified = false;
let licenseInfo = null;
let lastCheckTime = null;
let periodicTimer = null;
let onUnauthorized = null;

// ============ 工具函数 ============

/** 获取当前运行域名 */
function getCurrentDomain() {
  // 优先从环境变量获取
  if (process.env.LICENSE_DOMAIN) {
    return process.env.LICENSE_DOMAIN;
  }

  // 从 NEXT_PUBLIC_APP_URL / APP_URL 获取
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.VERCEL_URL;
  if (appUrl) {
    return appUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0];
  }

  // 服务端环境尝试从请求头获取（需要外部传入）
  // 客户端环境
  if (typeof window !== 'undefined' && window.location) {
    return window.location.hostname;
  }

  // 本地开发环境
  return 'localhost';
}

/** 读取本地缓存的授权信息 */
function readCache() {
  try {
    if (fs.existsSync(CONFIG.cachePath)) {
      const data = fs.readFileSync(CONFIG.cachePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // 缓存读取失败，忽略
  }
  return null;
}

/** 写入本地缓存 */
function writeCache(data) {
  try {
    fs.writeFileSync(CONFIG.cachePath, JSON.stringify(data, null, 2));
  } catch {
    // 缓存写入失败，忽略
  }
}

/** 清除本地缓存 */
function clearCache() {
  try {
    if (fs.existsSync(CONFIG.cachePath)) {
      fs.unlinkSync(CONFIG.cachePath);
    }
  } catch {
    // 忽略
  }
}

// ============ 核心验证逻辑 ============

/**
 * 验证授权码
 * @param {Object} options - 可选覆盖配置
 * @returns {Promise<Object>} 验证结果
 */
async function verifyLicense(options = {}) {
  const licenseKey = options.licenseKey || CONFIG.licenseKey;
  const verifyUrl = options.verifyUrl || CONFIG.verifyUrl;
  const domain = options.domain || getCurrentDomain();

  if (!licenseKey) {
    return { valid: false, code: 'no_license', message: '未配置授权码' };
  }

  if (!verifyUrl) {
    return { valid: false, code: 'no_verify_url', message: '未配置验证接口地址' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey, domain }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (data.valid) {
      isVerified = true;
      licenseInfo = data;
      lastCheckTime = Date.now();
      writeCache({
        valid: true,
        info: data,
        lastCheck: lastCheckTime,
        domain,
      });
    } else {
      isVerified = false;
      licenseInfo = null;
      clearCache();

      // 触发未授权回调
      if (onUnauthorized && typeof onUnauthorized === 'function') {
        onUnauthorized(data);
      }
    }

    return data;
  } catch (error) {
    // 网络错误时检查本地缓存（允许离线宽限）
    const cache = readCache();
    if (cache && cache.valid && cache.info) {
      // 检查缓存是否在 48 小时内（离线宽限期）
      const cacheAge = Date.now() - (cache.lastCheck || 0);
      if (cacheAge < 48 * 60 * 60 * 1000) {
        isVerified = true;
        licenseInfo = cache.info;
        return {
          valid: true,
          code: 'cached',
          message: '使用缓存授权（离线宽限期内）',
          ...cache.info,
        };
      }
    }

    isVerified = false;
    return {
      valid: false,
      code: 'network_error',
      message: `验证请求失败: ${error.message || '网络错误'}`,
    };
  }
}

/**
 * 初始化授权验证（项目启动时调用）
 * @param {Object} config - 配置
 * @param {string} config.licenseKey - 授权码
 * @param {string} config.verifyUrl - 验证接口地址（如 https://api.example.com/api/license/verify）
 * @param {Function} [config.onUnauthorized] - 授权失效回调
 * @param {boolean} [config.startPeriodic] - 是否启动定时校验（默认 true）
 * @returns {Promise<Object>} 验证结果
 */
async function initLicense(config) {
  if (!config || !config.licenseKey) {
    throw new Error('初始化失败：缺少 licenseKey');
  }
  if (!config.verifyUrl) {
    throw new Error('初始化失败：缺少 verifyUrl');
  }

  CONFIG.licenseKey = config.licenseKey;
  CONFIG.verifyUrl = config.verifyUrl;
  onUnauthorized = config.onUnauthorized || null;

  // 执行首次验证
  const result = await verifyLicense();

  // 启动定时校验
  if (config.startPeriodic !== false) {
    startPeriodicCheck();
  }

  return result;
}

/**
 * 启动定时校验（每 24 小时验证一次）
 */
function startPeriodicCheck() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
  }

  periodicTimer = setInterval(async () => {
    const result = await verifyLicense();
    if (!result.valid && onUnauthorized) {
      onUnauthorized(result);
    }
  }, CONFIG.checkInterval);

  // 防止进程退出时 timer 阻止退出
  if (periodicTimer.unref) {
    periodicTimer.unref();
  }
}

/**
 * 停止定时校验
 */
function stopPeriodicCheck() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

/**
 * 获取当前授权状态
 * @returns {Object} { isVerified, licenseInfo, lastCheckTime }
 */
function getLicenseStatus() {
  return {
    isVerified,
    licenseInfo,
    lastCheckTime,
  };
}

/**
 * Express/Koa 中间件：保护路由
 * 在中间件中调用，未授权时返回 403
 *
 * 用法（Express）：
 *   const { licenseMiddleware } = require('./license-verifier');
 *   app.use('/api/protected', licenseMiddleware, protectedRouter);
 */
function licenseMiddleware(req, res, next) {
  if (isVerified) {
    next();
  } else {
    if (res && typeof res.status === 'function') {
      res.status(403).json({
        error: '未授权',
        message: '系统未授权或授权已过期，请联系管理员',
        code: 'unauthorized',
      });
    } else if (next) {
      next();
    }
  }
}

/**
 * Next.js Edge Middleware 辅助函数
 * 在 middleware.ts 中使用
 *
 * 用法：
 *   import { checkLicenseForMiddleware } from './license-verifier';
 *   export async function middleware(request) {
 *     return await checkLicenseForMiddleware(request, {
 *       licenseKey: process.env.LICENSE_KEY,
 *       verifyUrl: process.env.LICENSE_VERIFY_URL,
 *     });
 *   }
 */
async function checkLicenseForMiddleware(request, config) {
  // 已验证则直接放行
  if (isVerified && lastCheckTime && (Date.now() - lastCheckTime < CONFIG.checkInterval)) {
    return null; // 放行
  }

  // 需要验证
  const result = await verifyLicense(config);
  if (result.valid) {
    return null; // 放行
  }

  // 未授权 → 重定向到未授权页面或返回 403
  if (config.unauthorizedUrl) {
    return Response.redirect(config.unauthorizedUrl, 302);
  }

  return new Response(
    JSON.stringify({ error: '未授权', message: result.message, code: result.code }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );
}

// ============ 版本检查功能 ============

/**
 * 检查产品版本更新
 * @param {string} apiUrl - 官网 API 地址（如 https://api.example.com/api）
 * @param {string} productSlug - 产品标识
 * @param {string} currentVersion - 当前版本号
 * @returns {Promise<Object>} 版本检查结果
 */
async function checkVersion(apiUrl, productSlug, currentVersion) {
  try {
    const res = await fetch(`${apiUrl}/products/${productSlug}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { hasUpdate: false, currentVersion, latestVersion: null };
    }
    const data = await res.json();
    const latest =
      (data.versions && data.versions.find((v) => v.isLatest)) ||
      (data.versions && data.versions[0]);
    if (!latest) {
      return { hasUpdate: false, currentVersion, latestVersion: null };
    }

    const hasUpdate = compareVersions(latest.version, currentVersion) > 0;
    return {
      hasUpdate,
      currentVersion,
      latestVersion: {
        version: latest.version,
        title: latest.title,
        changelog: latest.changelog,
        downloadUrl: latest.downloadUrl,
        downloadPassword: latest.downloadPassword,
        fileSize: latest.fileSize,
        createdAt: latest.createdAt,
      },
    };
  } catch {
    return { hasUpdate: false, currentVersion, latestVersion: null };
  }
}

/**
 * 比较版本号
 * 返回 >0 表示 a>b，<0 表示 a<b，0 表示相等
 * @param {string} a - 版本号 a
 * @param {string} b - 版本号 b
 * @returns {number} 比较结果
 */
function compareVersions(a, b) {
  const normalize = (v) =>
    String(v)
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number(part));
  const partsA = normalize(a);
  const partsB = normalize(b);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const va = partsA[i] || 0;
    const vb = partsB[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/**
 * 启动版本更新检查（每小时检查一次）
 * @param {string} apiUrl - 官网 API 地址
 * @param {string} productSlug - 产品标识
 * @param {string} currentVersion - 当前版本号
 * @param {Function} [onUpdate] - 发现新版本时的回调
 * @returns {Object} 定时器句柄
 */
function startVersionCheck(apiUrl, productSlug, currentVersion, onUpdate) {
  const timer = setInterval(async () => {
    const result = await checkVersion(apiUrl, productSlug, currentVersion);
    if (result.hasUpdate && onUpdate && typeof onUpdate === 'function') {
      onUpdate(result);
    }
  }, 60 * 60 * 1000); // 1 hour

  // 防止进程退出时 timer 阻止退出
  if (timer && typeof timer === 'object' && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

// ============ 导出 ============

module.exports = {
  initLicense,
  verifyLicense,
  startPeriodicCheck,
  stopPeriodicCheck,
  getLicenseStatus,
  licenseMiddleware,
  checkLicenseForMiddleware,
  getCurrentDomain,
  checkVersion,
  compareVersions,
  startVersionCheck,
};
