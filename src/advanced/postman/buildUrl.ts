import { buildQueryParams } from './buildQueryParams';
import { capitalize } from './capitalize';
import { StoredRoute, PostmanUrl } from './types';


export function buildUrl(route: StoredRoute): PostmanUrl {
  // Convert :param to {{param}} for Postman
  const pathWithVars = route.path.replace(/:(\w+)/g, '{{$1}}');
  const pathParts = pathWithVars.split('/').filter(Boolean);

  const url: PostmanUrl = {
    raw: '{{baseUrl}}' + pathWithVars,
    host: ['{{baseUrl}}'],
    path: pathParts
  };

  // Add path variables
  const pathParams = route.path.match(/:(\w+)/g);
  if (pathParams) {
    url.variable = pathParams.map(p => ({
      key: p.slice(1),
      value: '',
      description: `${capitalize(p.slice(1))} parameter`
    }));
  }

  // Add query parameters from schema
  if (route.schema?.query) {
    url.query = buildQueryParams(route.schema.query);
  }

  return url;
}
