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
 * Priority (highest wins): root category → ... → immediate category → request values
 *
 * The chain is [immediate, parent, ..., root], so we process it reversed
 * (root first), then let request values fill in anything not set by a category.
 *
 * In practice: root always wins. Request values are only used when no category
 * in the chain defines the same key.
 */
export function mergeKeyValues(
  requestValues: KeyValuePair[],
  categoryChain: Category[],
  field: 'defaultHeaders' | 'defaultParams'
): KeyValuePair[] {
  // Map of lowercased key → final pair; later assignments overwrite earlier ones.
  // Process order: request (weakest) → immediate category → ... → root (strongest).
  const result = new Map<string, KeyValuePair>();

  // Weakest: request's own values
  for (const kv of requestValues) {
    if (kv.key && kv.enabled) {
      result.set(kv.key.toLowerCase(), kv);
    }
  }

  // Stronger: each level up the chain (root overwrites immediate)
  // chain is [immediate, ..., root], so we process root last (highest priority)
  for (let i = categoryChain.length - 1; i >= 0; i--) {
    const cat = categoryChain[i];
    for (const kv of cat[field]) {
      if (kv.key && kv.enabled) {
        result.set(kv.key.toLowerCase(), { ...kv });
      }
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
