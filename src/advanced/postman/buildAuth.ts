import { PostmanAuth } from './types';


export function buildAuth(auth: PostmanAuth): any {
  switch (auth.type) {
    case 'bearer':
      return {
        type: 'bearer',
        bearer: [{ key: 'token', value: auth.bearer?.token || '{{token}}', type: 'string' }]
      };
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.apikey?.key || 'X-API-Key', type: 'string' },
          { key: 'value', value: auth.apikey?.value || '{{apiKey}}', type: 'string' },
          { key: 'in', value: auth.apikey?.in || 'header', type: 'string' }
        ]
      };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.basic?.username || '{{username}}', type: 'string' },
          { key: 'password', value: auth.basic?.password || '{{password}}', type: 'string' }
        ]
      };
    default:
      return undefined;
  }
}
