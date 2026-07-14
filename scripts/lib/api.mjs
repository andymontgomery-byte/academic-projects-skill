// Connection helper. Reads work with zero configuration: the anon key below
// is bundled on purpose — it is a public-by-design Supabase key whose RLS
// grants SELECT on everything plus INSERT on improvement_requests, nothing
// else. Writes require the service key (env var or the local key file);
// never print key contents.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

export const SUPABASE_URL = process.env.ACADEMIC_PROJECTS_URL
  ?? 'https://jigpfagovaueekufildm.supabase.co';

// anon (read-only) key — safe to ship; see header comment.
const PUBLIC_READ_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppZ3BmYWdvdmF1ZWVrdWZpbGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzU4MDUsImV4cCI6MjA5OTU1MTgwNX0.zsttvvdJ2aXyI3wkaGox7TZoKwhy6gwUoKLSkPDO0Lw';

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
  if (!write) return PUBLIC_READ_KEY;
  throw new Error('Writes need ACADEMIC_PROJECTS_SERVICE_KEY (or use the UI: https://timeback-loops-k8.vercel.app/academic-projects)');
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
