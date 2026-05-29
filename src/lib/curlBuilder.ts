import { HttpMethod } from './types';

const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function shellEscape(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Build a curl command string from the given request parameters.
 * All headers and params must already be resolved (variables expanded, inherited values merged).
 */
export function buildCurlCommand(
  method: HttpMethod | string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  const lines: string[] = [`curl -X ${method}`];
  lines.push(`  '${shellEscape(url)}'`);

  for (const [key, value] of Object.entries(headers)) {
    lines.push(`  -H '${shellEscape(key)}: ${shellEscape(value)}'`);
  }

  if (body && BODY_METHODS.has(method)) {
    lines.push(`  --data-raw '${shellEscape(body)}'`);
  }

  return lines.join(' \\\n');
}
