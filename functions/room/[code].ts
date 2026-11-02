/// <reference types="@cloudflare/workers-types" />

// Forward a table socket to the rooms Worker. The service binding keeps the
// Worker private: it is reachable only through this function.

interface Env {
  ROOMS: Fetcher;
}

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

export const onRequest: PagesFunction<Env, 'code'> = async ({ request, env, params }) => {
  const code = String(params.code ?? '').toUpperCase();
  if (!CODE_RE.test(code)) return new Response('No such table.', { status: 404 });
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('This door only opens for a websocket.', { status: 426 });
  }
  return env.ROOMS.fetch(request);
};
