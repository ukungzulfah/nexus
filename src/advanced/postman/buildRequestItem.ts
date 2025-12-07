import { buildBody } from './buildBody';
import { buildResponses } from './buildResponses';
import { buildUrl } from './buildUrl';
import { generateName } from './generateName';
import { StoredRoute, PostmanConfig, PostmanItem } from './types';


export function buildRequestItem(route: StoredRoute, config: PostmanConfig): PostmanItem {
  const meta = route.meta || {};
  const name = meta.summary || generateName(route.method, route.path);

  const item: PostmanItem = {
    name,
    request: {
      method: route.method,
      header: [
        { key: 'Content-Type', value: 'application/json', type: 'text' },
        { key: 'Accept', value: 'application/json', type: 'text' }
      ],
      url: buildUrl(route),
      description: meta.description
    }
  };

  // Add request body for POST/PUT/PATCH
  if (route.schema?.body && ['POST', 'PUT', 'PATCH'].includes(route.method)) {
    item.request!.body = buildBody(route.schema.body);
  }

  // Add example responses
  if (config.includeExamples && meta.responses) {
    item.response = buildResponses(meta.responses, name);
  }

  return item;
}
