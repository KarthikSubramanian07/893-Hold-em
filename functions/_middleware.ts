/// <reference types="@cloudflare/workers-types" />

// Every page request passes through here first: Markdown for agents that ask
// for it, honest 404s for addresses that aren't pages. See src/edge/agents.ts.
// Static assets skip this function entirely (public/_routes.json).

import { answer } from '../src/edge/agents';

interface Env {
  ASSETS: Fetcher;
}

export const onRequest: PagesFunction<Env> = ({ request, next, env }) =>
  answer(
    request,
    () => next(),
    (path) => env.ASSETS.fetch(new Request(new URL(path, request.url), { headers: { Accept: '*/*' } })),
  );
