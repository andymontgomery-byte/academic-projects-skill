// Connection helper. Resolution order: explicit env vars, then the local
// key file (~/.academic-projects-skill/api-keys.json, as written by
// `supabase projects api-keys -o json`). Never print key contents.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

export const SUPABASE_URL = process.env.ACADEMIC_PROJECTS_URL
  ?? 'https://jigpfagovaueekufildm.supabase.co';

export function resolveKey({ write = false } = {}) {
  const envKey = write
    ? process.env.ACADEMIC_PROJECTS_SERVICE_KEY
    : (process.env.ACADEMIC_PROJECTS_KEY ?? process.env.ACADEMIC_PROJECTS_SERVICE_KEY);
  if (envKey) return envKey;
  try {
    const keys = JSON.parse(readFileSync(`${homedir()}/.academic-projects-skill/api-keys.json`, 'utf8'));
    const name = write ? 'service_role' : 'anon';
    const hit = keys.find((k) => k.name === name);
    if (hit) return hit.api_key;
  } catch { /* fall through */ }
  throw new Error(
    `No API key. Set ${write ? 'ACADEMIC_PROJECTS_SERVICE_KEY' : 'ACADEMIC_PROJECTS_KEY'} `
    + 'or provide ~/.academic-projects-skill/api-keys.json',
  );
}

export async function rest(path, { method = 'GET', body, write = false, headers = {} } = {}) {
  const key = resolveKey({ write });
  const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${resp.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const rpc = (fn, args, opts = {}) =>
  rest(`/rpc/${fn}`, { method: 'POST', body: args, write: true, ...opts });
