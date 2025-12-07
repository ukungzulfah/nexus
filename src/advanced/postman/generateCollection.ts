import { buildAuth } from './buildAuth';
import { buildRequestItem } from './buildRequestItem';
import { generateUUID } from './generateUUID';
import { getTagFromPath } from './getTagFromPath';
import { StoredRoute, PostmanConfig, PostmanCollection, PostmanItem } from './types';

// ============================================
// COLLECTION GENERATION
// ============================================

export function generateCollection(
  routes: StoredRoute[],
  config: PostmanConfig,
  baseUrl: string
): PostmanCollection {
  const collection: PostmanCollection = {
    info: {
      _postman_id: generateUUID(),
      name: config.name!,
      description: config.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [],
    variable: [
      { key: 'baseUrl', value: baseUrl, type: 'string' }
    ]
  };

  // Add auth if configured
  if (config.auth) {
    collection.auth = buildAuth(config.auth);
  }

  // Group routes by tags
  const grouped = new Map<string, StoredRoute[]>();

  for (const route of routes) {
    // Skip postman's own endpoints
    if (route.path.startsWith(config.path!)) continue;

    const tag = route.meta?.tags?.[0] || getTagFromPath(route.path);

    if (!grouped.has(tag)) {
      grouped.set(tag, []);
    }
    grouped.get(tag)!.push(route);
  }

  // Build folder structure
  for (const [tag, tagRoutes] of grouped) {
    const folder: PostmanItem = {
      name: tag,
      item: tagRoutes.map(route => buildRequestItem(route, config))
    };
    collection.item.push(folder);
  }

  return collection;
}
