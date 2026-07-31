# ET Studio 授权验证 SDK

本 SDK 提供产品授权验证与版本更新检查能力，供购买授权的项目嵌入使用。

- `license-verifier.ts` —— TypeScript / Next.js 项目使用
- `license-verifier.js` —— Node.js / CommonJS 项目使用

两个版本功能完全一致，本文档同时适用于 TS 与 JS 项目。TypeScript 项目可享受类型提示；Node.js 项目直接 `require` 即可。

---

## 目录

- [安装说明](#安装说明)
- [初始化授权验证](#初始化授权验证)
- [定时校验](#定时校验)
- [版本更新检查](#版本更新检查)
- [Express 中间件用法](#express-中间件用法)
- [Next.js Edge Middleware 用法](#nextjs-edge-middleware-用法)
- [部署流程](#部署流程)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

---

## 安装说明

本 SDK 不发布到 npm，通过**复制文件**的方式集成到项目中。

### 1. 复制 SDK 文件

将对应的 SDK 文件复制到你的项目目录中，例如 `lib/` 或 `sdk/` 目录下：

```bash
# TypeScript / Next.js 项目
cp license-verifier.ts your-project/lib/license-verifier.ts

# Node.js / CommonJS 项目
cp license-verifier.js your-project/lib/license-verifier.js
```

建议放在统一目录下，方便后续升级。

### 2. 环境要求

- Node.js 18+（内置 `fetch` 与 `AbortController`，无需额外依赖）
- TypeScript 项目需要 `tsconfig.json` 中 `target` >= `ES2017`
- 无需安装任何第三方包

### 3. 验证安装

```typescript
// TypeScript
import { getLicenseStatus } from './lib/license-verifier';
console.log(getLicenseStatus());
```

```javascript
// JavaScript
const { getLicenseStatus } = require('./lib/license-verifier');
console.log(getLicenseStatus());
```

如能正常打印 `{ isVerified: false, licenseInfo: null, lastCheckTime: null }`，说明安装成功。

---

## 初始化授权验证

项目启动时调用 `initLicense`，SDK 会自动完成首次验证，并按配置决定是否启动定时校验。

### TypeScript

```typescript
import { initLicense } from './lib/license-verifier';

await initLicense({
  licenseKey: process.env.LICENSE_KEY!,                 // 授权码（后台分配）
  verifyUrl: 'https://api.example.com/api/license/verify', // 官网验证接口
  onUnauthorized: (result) => {
    console.error('授权失效：', result.message);
    // 这里可以发送通知邮件、关闭服务、重定向等
  },
  startPeriodic: true, // 默认 true，启动 24 小时定时校验
});
```

### JavaScript

```javascript
const { initLicense } = require('./lib/license-verifier');

await initLicense({
  licenseKey: process.env.LICENSE_KEY,
  verifyUrl: 'https://api.example.com/api/license/verify',
  onUnauthorized: (result) => {
    console.error('授权失效：', result.message);
  },
  startPeriodic: true,
});
```

### 参数说明

| 参数            | 类型       | 必填 | 说明                                       |
| --------------- | ---------- | ---- | ------------------------------------------ |
| `licenseKey`    | `string`   | 是   | 授权码，由官网后台分配                     |
| `verifyUrl`     | `string`   | 是   | 官网授权验证接口地址                       |
| `onUnauthorized`| `Function` | 否   | 授权失效时的回调函数                       |
| `startPeriodic` | `boolean`  | 否   | 是否启动定时校验，默认 `true`              |
| `domain`        | `string`   | 否   | 手动指定运行域名（一般不需要，SDK 会自动获取） |

### 初始化结果

`initLicense` 返回一个 `LicenseResult` 对象：

```typescript
interface LicenseResult {
  valid: boolean;          // 是否有效
  code: string;            // 状态码：valid / no_license / no_verify_url / network_error / unauthorized
  message: string;         // 描述信息
  project_name?: string;    // 产品名称
  project_type?: string;    // 产品类型
  expires_at?: string;      // 到期时间
  max_domains?: number;    // 最大可绑定域名数
  bound_domains?: number;  // 已绑定域名数
  expired_at?: string;     // 过期时间
}
```

---

## 定时校验

`initLicense` 默认会启动每 24 小时一次的定时校验。你也可以手动控制：

```typescript
import { startPeriodicCheck, stopPeriodicCheck } from './lib/license-verifier';

// 手动启动定时校验（每 24 小时一次）
startPeriodicCheck();

// 停止定时校验（例如在优雅退出时）
process.on('SIGTERM', () => {
  stopPeriodicCheck();
  process.exit(0);
});
```

定时校验失败时会自动触发 `onUnauthorized` 回调。在 JS 版本中，如果发生网络错误，SDK 会尝试使用本地缓存的授权信息（48 小时离线宽限期），保证服务可用性。

---

## 版本更新检查

SDK 提供独立的版本检查功能，可以检测官网是否发布了新版本，并提示用户更新。

### 1. 手动检查版本

```typescript
import { checkVersion } from './lib/license-verifier';

const result = await checkVersion(
  'https://api.example.com/api', // 官网 API 地址
  'my-product-slug',             // 产品标识（后台创建产品时设置）
  '1.0.0'                        // 当前版本号
);

if (result.hasUpdate) {
  console.log(`发现新版本：${result.latestVersion.version}`);
  console.log(`更新标题：${result.latestVersion.title}`);
  console.log(`更新日志：${result.latestVersion.changelog}`);
  console.log(`下载地址：${result.latestVersion.downloadUrl}`);
  if (result.latestVersion.downloadPassword) {
    console.log(`下载密码：${result.latestVersion.downloadPassword}`);
  }
} else {
  console.log('当前已是最新版本');
}
```

### 2. 启动定时版本检查

```typescript
import { startVersionCheck } from './lib/license-verifier';

// 每小时自动检查一次版本更新
const timer = startVersionCheck(
  'https://api.example.com/api',
  'my-product-slug',
  '1.0.0',
  (result) => {
    console.log(`发现新版本：${result.latestVersion.version}`);
    // 在这里可以发邮件通知、写入日志、更新 UI 提示等
  }
);

// 需要停止时
clearInterval(timer);
```

### 3. 版本比较工具

SDK 内置了 `compareVersions` 工具函数：

```typescript
import { compareVersions } from './lib/license-verifier';

compareVersions('1.2.0', '1.1.0');  // 1  (a > b)
compareVersions('1.0.0', '1.0.0');  // 0  (相等)
compareVersions('1.0.0', '1.1.0');   // -1 (a < b)
compareVersions('v2.0.0', '1.9.9'); // 1  (自动去除 v 前缀)
```

### 返回结果结构

```typescript
interface VersionInfo {
  version: string;            // 版本号
  title: string;              // 版本标题
  changelog: string;          // 更新日志
  downloadUrl: string;        // 源码下载地址
  downloadPassword?: string;  // 下载密码（如有）
  fileSize?: string;          // 文件大小
  createdAt: string;          // 发布时间
}

interface VersionCheckResult {
  hasUpdate: boolean;            // 是否有更新
  currentVersion: string | null; // 当前版本
  latestVersion: VersionInfo | null; // 最新版本信息
}
```

---

## Express 中间件用法

在 Express / Koa 项目中，可以使用 `licenseMiddleware` 保护需要授权才能访问的路由：

```javascript
const express = require('express');
const { initLicense, licenseMiddleware } = require('./lib/license-verifier');

const app = express();

// 项目启动时初始化（仅执行一次）
await initLicense({
  licenseKey: process.env.LICENSE_KEY,
  verifyUrl: 'https://api.example.com/api/license/verify',
  onUnauthorized: (result) => {
    console.error('授权失效，请及时处理：', result.message);
  },
});

// 保护所有 API 路由
app.use('/api', licenseMiddleware);

// 或者保护特定路由
app.get('/api/protected-data', licenseMiddleware, (req, res) => {
  res.json({ data: '这是需要授权才能访问的数据' });
});

// 公开路由不受影响
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3000);
```

未授权时中间件会返回：

```json
{
  "error": "未授权",
  "message": "系统未授权或授权已过期，请联系管理员",
  "code": "unauthorized"
}
```

---

## Next.js Edge Middleware 用法

在 Next.js 项目中，可以在 `middleware.ts` 中调用 `checkLicenseForMiddleware`，在请求进入应用前完成授权校验：

```typescript
// middleware.ts
import { checkLicenseForMiddleware } from './lib/license-verifier';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // 仅对需要保护的路由进行校验
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const response = await checkLicenseForMiddleware(request, {
      licenseKey: process.env.LICENSE_KEY!,
      verifyUrl: process.env.LICENSE_VERIFY_URL!,
      unauthorizedUrl: '/unauthorized', // 可选：未授权时重定向的页面
    });
    if (response) return response; // 返回非 null 表示拦截
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
```

同时在应用初始化时调用 `initLicense`：

```typescript
// app/layout.tsx 或 instrumentation.ts
import { initLicense } from './lib/license-verifier';

await initLicense({
  licenseKey: process.env.LICENSE_KEY!,
  verifyUrl: process.env.LICENSE_VERIFY_URL!,
});
```

> 提示：`checkLicenseForMiddleware` 内部会缓存验证结果（默认 24 小时），在缓存有效期内不会重复请求验证接口，避免影响 Edge 性能。

---

## 部署流程

完整的从官网部署到用户项目上线的流程：

### 1. 部署官网（本项目）到 Vercel

```bash
# 克隆官网项目
git clone <repo-url> ethhy-website
cd ethhy-website

# 安装依赖
npm install

# 配置环境变量（参考 .env.example）
cp .env.example .env
# 编辑 .env 填写 DATABASE_URL、NEXTAUTH_SECRET 等

# 初始化数据库
npm run db:setup

# 本地开发
npm run dev

# 部署到 Vercel
vercel
```

部署完成后，记录官网 API 地址，例如 `https://your-domain.com/api`。

### 2. 在后台创建产品

登录管理后台（`/admin`），进入 **产品销售 → 产品管理**：

1. 点击"创建产品"
2. 填写产品名称、产品标识（slug，如 `my-product`）、描述
3. 设置授权类型（永久 / 订阅 / 按域名）
4. 配置可绑定域名数量、有效期等

### 3. 创建版本并上传源码

在产品详情页创建版本：

1. 点击"新建版本"
2. 填写版本号（如 `1.0.0`）、版本标题、更新日志
3. 上传源码压缩包（zip）
4. 设置下载密码（可选）
5. 标记为最新版本（`isLatest`）

### 4. 用户购买后获得授权码

用户在前台完成购买流程后：

1. 系统自动生成授权码（格式 `ET-XXXXXXXX-XXXXXXXX-XXXXXXXX`）
2. 授权码发送到用户邮箱，并显示在"我的订单"页面
3. 用户在个人中心绑定运行域名

### 5. 在用户项目中集成 SDK

用户拿到授权码后，将 SDK 集成到自己的项目：

```bash
# 复制 SDK 文件
cp license-verifier.ts user-project/lib/
```

配置环境变量：

```bash
# .env
LICENSE_KEY=ET-XXXXXXXX-XXXXXXXX-XXXXXXXX
LICENSE_VERIFY_URL=https://your-domain.com/api/license/verify
LICENSE_DOMAIN=app.user-domain.com   # 可选，一般自动识别
```

在项目入口初始化：

```typescript
import { initLicense } from './lib/license-verifier';

await initLicense({
  licenseKey: process.env.LICENSE_KEY!,
  verifyUrl: process.env.LICENSE_VERIFY_URL!,
  onUnauthorized: (result) => {
    console.error('授权失效：', result.message);
  },
});
```

### 6. 用户部署项目，启动时自动验证

用户部署项目后，每次启动都会自动执行：

1. 调用 `initLicense` 完成首次验证
2. 验证通过 → 正常启动服务
3. 验证失败 → 触发 `onUnauthorized` 回调
4. 启动定时校验（默认每 24 小时）
5. 可选：启动版本更新检查（每小时）

---

## 配置说明

### 环境变量

| 变量名                 | 必填 | 说明                                       |
| ---------------------- | ---- | ------------------------------------------ |
| `LICENSE_KEY`          | 是   | 授权码，由官网后台分配                     |
| `LICENSE_VERIFY_URL`   | 是   | 官网授权验证接口地址                       |
| `LICENSE_DOMAIN`        | 否   | 手动指定运行域名（不填则自动识别）         |
| `NEXT_PUBLIC_APP_URL`  | 否   | Next.js 应用地址，用于自动识别域名         |
| `APP_URL`              | 否   | 应用地址，用于自动识别域名                 |
| `VERCEL_URL`           | 否   | Vercel 自动注入的部署地址，用于自动识别域名 |

### LICENSE_DOMAIN 环境变量

SDK 通过 `getCurrentDomain()` 自动识别当前运行域名，识别顺序为：

1. `process.env.LICENSE_DOMAIN`（最高优先级）
2. `process.env.NEXT_PUBLIC_APP_URL` / `APP_URL` / `VERCEL_URL`
3. 客户端环境：`window.location.hostname`
4. 兜底：`localhost`

**何时需要手动设置 `LICENSE_DOMAIN`：**

- 使用反向代理时，自动识别的域名可能不准确
- 本地开发时希望指定特定域名测试
- Docker 部署时容器内无法获取真实域名
- Serverless 部署（如 Vercel）时域名识别异常

```bash
# 显式指定运行域名
LICENSE_DOMAIN=app.my-domain.com
```

> 注意：`LICENSE_DOMAIN` 必须与在官网后台绑定的域名**完全一致**（包括是否带 `www.`），否则验证会失败。

### 校验间隔配置

SDK 默认校验间隔为 24 小时。如需调整，可在初始化后手动管理定时器，或直接修改 `CONFIG.checkInterval`（单位毫秒）：

```typescript
// 不推荐直接修改，建议通过 startPeriodic 参数控制
```

---

## 常见问题

### Q1: 验证失败提示 "未配置授权码"

检查环境变量 `LICENSE_KEY` 是否已正确设置，且未被引号包裹。在 `.env` 文件中应写为：

```bash
LICENSE_KEY=ET-XXXXXXXX-XXXXXXXX-XXXXXXXX
```

### Q2: 验证失败提示 "网络错误"

可能原因：

1. `LICENSE_VERIFY_URL` 地址不正确或不可访问
2. 服务器无法访问外网（防火墙限制）
3. 官网服务未启动或部署失败
4. 请求超时（默认 10 秒）

排查方法：

```bash
# 测试验证接口是否可达
curl -X POST https://your-domain.com/api/license/verify \
  -H "Content-Type: application/json" \
  -d '{"license_key":"ET-XXXX","domain":"localhost"}'
```

### Q3: 授权码正确但提示 "域名不匹配"

授权码绑定的域名与当前运行域名不一致。请检查：

1. 后台绑定的域名是否正确
2. `LICENSE_DOMAIN` 环境变量是否误设
3. 是否带 `www.` 前缀导致不匹配

### Q4: 本地开发时一直验证失败

本地开发时 `getCurrentDomain()` 返回 `localhost`，需要：

1. 在后台为该授权码绑定 `localhost` 域名，或
2. 设置 `LICENSE_DOMAIN` 为已绑定的测试域名

### Q5: 网络断开时服务还能用吗？

JS 版本支持**离线宽限**：网络错误时会读取本地缓存的授权信息（`.license-cache.json`），若缓存时间在 48 小时内，仍判定为已授权。超过 48 小时则会判定为未授权。

TS 版本（用于 Edge / Serverless 环境）不带本地缓存，建议配合 `checkLicenseForMiddleware` 的缓存机制使用。

### Q6: 版本检查接口返回 404

确认：

1. `apiUrl` 是否正确（应为官网 API 根地址，如 `https://api.example.com/api`）
2. `productSlug` 是否与后台创建产品时的标识一致
3. 产品是否已创建版本

### Q7: 如何在容器化环境中使用？

Docker 部署示例：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
ENV LICENSE_KEY=ET-XXXXXXXX-XXXXXXXX-XXXXXXXX
ENV LICENSE_VERIFY_URL=https://your-domain.com/api/license/verify
ENV LICENSE_DOMAIN=app.my-domain.com
CMD ["node", "dist/index.js"]
```

### Q8: 如何优雅退出时清理定时器？

```typescript
import { stopPeriodicCheck } from './lib/license-verifier';

process.on('SIGTERM', () => {
  stopPeriodicCheck();
  process.exit(0);
});

process.on('SIGINT', () => {
  stopPeriodicCheck();
  process.exit(0);
});
```

### Q9: 一个授权码可以绑定多个域名吗？

取决于授权类型配置。`LicenseResult` 中的 `max_domains` 表示最大可绑定数量，`bound_domains` 表示已绑定数量。如需绑定更多域名，请联系管理员升级授权。

### Q10: SDK 升级后需要重新配置吗？

SDK 升级只需替换 `license-verifier.ts` / `license-verifier.js` 文件，无需更改环境变量与配置。建议升级前先备份旧版本文件。
