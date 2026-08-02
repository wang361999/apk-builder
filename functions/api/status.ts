// GET /api/status - 查询两个 Vercel 账号的部署状态和站点健康

interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: string; // READY | BUILDING | ERROR | QUEUED | CANCELED
  createdAt: number;
  meta?: {
    githubCommitMessage?: string;
    githubCommitSha?: string;
  };
}

interface VercelDeploymentsResponse {
  deployments: VercelDeployment[];
}

// 部署状态中文映射
const STATE_LABELS: Record<string, string> = {
  READY: '已就绪',
  BUILDING: '构建中',
  ERROR: '部署失败',
  QUEUED: '排队中',
  CANCELED: '已取消',
  INITIALIZING: '初始化中',
};

// 获取单个账号的配置
function getAccountConfig(env: Env, account: 'A' | 'B'): AccountConfig {
  const suffix = account;
  return {
    name: (env as Record<string, string>)[`ACCOUNT_NAME_${suffix}`] || `账号 ${account}`,
    token: (env as Record<string, string>)[`VERCEL_TOKEN_${suffix}`] || '',
    projectId: (env as Record<string, string>)[`VERCEL_PROJECT_ID_${suffix}`] || '',
    deployHook: (env as Record<string, string>)[`DEPLOY_HOOK_${suffix}`] || '',
    siteUrl: (env as Record<string, string>)[`SITE_URL_${suffix}`] || '',
  };
}

// 查询 Vercel 最新部署
async function fetchVercelDeployments(config: AccountConfig): Promise<VercelDeployment | null> {
  if (!config.token || !config.projectId) return null;

  const url = `https://api.vercel.com/v6/deployments?projectId=${config.projectId}&limit=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.token}` },
  });

  if (!res.ok) {
    throw new Error(`Vercel API 返回 ${res.status}`);
  }

  const data = (await res.json()) as VercelDeploymentsResponse;
  return data.deployments?.[0] || null;
}

// 健康检查 - 检查站点是否可访问
async function checkSiteHealth(siteUrl: string): Promise<{ online: boolean; statusCode: number | null; paused: boolean }> {
  if (!siteUrl) return { online: false, statusCode: null, paused: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(siteUrl, {
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    // Vercel 暂停的项目返回 503 DEPLOYMENT_PAUSED
    const isPaused = res.status === 503;
    return { online: res.ok, statusCode: res.status, paused: isPaused };
  } catch {
    clearTimeout(timeout);
    return { online: false, statusCode: null, paused: false };
  }
}

// 查询单个账号的完整状态
async function getAccountStatus(env: Env, account: 'A' | 'B'): Promise<AccountStatus> {
  const config = getAccountConfig(env, account);
  const configured = Boolean(config.token && config.projectId);

  if (!configured) {
    return {
      name: config.name,
      configured: false,
      deployState: null,
      deployStateLabel: '未配置',
      deployUrl: null,
      createdAt: null,
      commitMessage: null,
      siteOnline: null,
      siteStatusCode: null,
      hookConfigured: Boolean(config.deployHook),
      paused: null,
      error: '缺少 VERCEL_TOKEN 或 VERCEL_PROJECT_ID 环境变量',
    };
  }

  try {
    // 并行：查部署状态 + 健康检查
    const [deployment, health] = await Promise.all([
      fetchVercelDeployments(config),
      checkSiteHealth(config.siteUrl),
    ]);

    return {
      name: config.name,
      configured: true,
      deployState: deployment?.state || null,
      deployStateLabel: deployment ? (STATE_LABELS[deployment.state] || deployment.state) : '无部署记录',
      deployUrl: deployment ? `https://${deployment.url}` : null,
      createdAt: deployment ? new Date(deployment.createdAt).toISOString() : null,
      commitMessage: deployment?.meta?.githubCommitMessage || null,
      siteOnline: health.online,
      siteStatusCode: health.statusCode,
      hookConfigured: Boolean(config.deployHook),
      paused: health.paused,
      error: null,
    };
  } catch (err) {
    return {
      name: config.name,
      configured: true,
      deployState: null,
      deployStateLabel: '查询失败',
      deployUrl: null,
      createdAt: null,
      commitMessage: null,
      siteOnline: null,
      siteStatusCode: null,
      hookConfigured: Boolean(config.deployHook),
      paused: null,
      error: err instanceof Error ? err.message : '未知错误',
    };
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;

  // 并行查询两个账号
  const [accountA, accountB] = await Promise.all([
    getAccountStatus(env, 'A'),
    getAccountStatus(env, 'B'),
  ]);

  return new Response(
    JSON.stringify({
      accountA,
      accountB,
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    },
  );
};
