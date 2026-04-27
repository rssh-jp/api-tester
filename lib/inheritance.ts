import { Category, KeyValuePair } from './types';

/**
 * Build the ancestor chain for a category, from immediate parent up to root.
 * Returns [immediate, parent, ..., root]
 */
export function buildCategoryChain(
  categoryId: string | null,
  categories: Category[]
): Category[] {
  const chain: Category[] = [];
  let currentId: string | null = categoryId;

  while (currentId) {
    const cat = categories.find(c => c.id === currentId);
    if (!cat) break;
    chain.push(cat);
    currentId = cat.parentId;
  }

  return chain; // [immediate, ..., root]
}

/**
 * Merge key-value pairs applying category inheritance.
 *
 * Priority (highest wins): request values → immediate category → ... → root category
 *
 * Categories provide defaults; request-level values override them.
 */
export function mergeKeyValues(
  requestValues: KeyValuePair[],
  categoryChain: Category[],
  field: 'defaultHeaders' | 'defaultParams'
): KeyValuePair[] {
  // Map of lowercased key → final pair; later assignments overwrite earlier ones.
  const result = new Map<string, KeyValuePair>();

  // Weakest: root category. Stronger toward immediate.
  // chain is [immediate, ..., root]; iterate from root (last index) to immediate (0),
  // so immediate overwrites root.
  for (let i = categoryChain.length - 1; i >= 0; i--) {
    const cat = categoryChain[i];
    for (const kv of cat[field]) {
      if (kv.key && kv.enabled) {
        result.set(kv.key.toLowerCase(), { ...kv });
      }
    }
  }

  // Strongest: request's own values override all category defaults.
  for (const kv of requestValues) {
    if (kv.key && kv.enabled) {
      result.set(kv.key.toLowerCase(), kv);
    }
  }

  return Array.from(result.values());
}

/**
 * Compute the final (merged) headers and params for a request,
 * given its own values and the category it belongs to.
 */
export function computeEffectiveValues(
  requestHeaders: KeyValuePair[],
  requestParams: KeyValuePair[],
  categoryId: string | null,
  categories: Category[]
): { headers: KeyValuePair[]; params: KeyValuePair[] } {
  const chain = buildCategoryChain(categoryId, categories);
  return {
    headers: mergeKeyValues(requestHeaders, chain, 'defaultHeaders'),
    params: mergeKeyValues(requestParams, chain, 'defaultParams'),
  };
}

/**
 * Resolve variables for a category chain.
 *
 * Priority (highest wins): immediate category → ... → root category
 * (child overrides parent — opposite of headers/params)
 */
export function computeEffectiveVariables(
  categoryId: string | null,
  categories: Category[]
): KeyValuePair[] {
  if (categoryId === null) return [];
  const chain = buildCategoryChain(categoryId, categories);
  // chain = [immediate, ..., root]
  // Iterate from root (last) to immediate (first) so immediate writes last and wins.
  const result = new Map<string, KeyValuePair>();
  for (let i = chain.length - 1; i >= 0; i--) {
    const cat = chain[i];
    for (const kv of (cat.variables ?? [])) {
      if (kv.key && kv.enabled) {
        result.set(kv.key, kv);
      }
    }
  }
  return Array.from(result.values());
}

/**
 * Replace ${KEY} placeholders in text with values from the variables array.
 * Undefined variables are left as-is (silent pass-through).
 */
export function applyVariables(text: string, variables: KeyValuePair[]): string {
  if (variables.length === 0) return text;
  const map = new Map(variables.map(v => [v.key, v.value]));
  return text.replace(/\$\{([^}]+)\}/g, (match, key) =>
    map.has(key) ? map.get(key)! : match
  );
}
