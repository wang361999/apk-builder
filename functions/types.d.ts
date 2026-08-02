interface Env {
  VERCEL_TOKEN_A: string;
  VERCEL_PROJECT_ID_A: string;
  DEPLOY_HOOK_A: string;
  SITE_URL_A: string;
  ACCOUNT_NAME_A: string;

  VERCEL_TOKEN_B: string;
  VERCEL_PROJECT_ID_B: string;
  DEPLOY_HOOK_B: string;
  SITE_URL_B: string;
  ACCOUNT_NAME_B: string;

  PANEL_PASSWORD: string;
}

// 账号配置
interface AccountConfig {
  name: string;
  token: string;
  projectId: string;
  deployHook: string;
  siteUrl: string;
}

// 账号状态
interface AccountStatus {
  name: string;
  configured: boolean;
  deployState: string | null;    // READY / BUILDING / ERROR / QUEUED
  deployStateLabel: string;      // 中文标签
  deployUrl: string | null;      // 最新部署的 URL
  createdAt: string | null;      // 部署时间
  commitMessage: string | null;  // 最新 commit 信息
  siteOnline: boolean | null;    // 站点是否可访问
  siteStatusCode: number | null; // 站点 HTTP 状态码
  hookConfigured: boolean;       // Deploy Hook 是否配置
  paused: boolean | null;        // 项目是否已暂停
  error: string | null;
}
