// 鉴权中间件 - 保护所有 /api/* 路由
// 通过 X-Panel-Password header 验证密码

export const onRequest: PagesFunction<Env> = async (context) => {
  const expectedPassword = context.env.PANEL_PASSWORD;

  // 未设置密码时跳过鉴权（仅开发环境，生产环境务必设置）
  if (!expectedPassword) {
    return context.next();
  }

  const password = context.request.headers.get('X-Panel-Password');

  if (password !== expectedPassword) {
    return new Response(
      JSON.stringify({ error: '密码错误，请重新登录' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return context.next();
};
