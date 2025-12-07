import { generateUUID } from './generateUUID';
import { PostmanConfig, PostmanEnvironment, PostmanEnvVariable } from './types';

// ============================================
// ENVIRONMENT GENERATION
// ============================================

export function generateEnvironment(config: PostmanConfig, baseUrl: string): PostmanEnvironment {
  const variables: PostmanEnvVariable[] = [
    { key: 'baseUrl', value: baseUrl, type: 'default', enabled: true },
    { key: 'token', value: '', type: 'secret', enabled: true },
    { key: 'apiKey', value: '', type: 'secret', enabled: true }
  ];

  // Add custom variables
  if (config.variables) {
    for (const [key, value] of Object.entries(config.variables)) {
      variables.push({
        key,
        value,
        type: key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')
          ? 'secret' : 'default',
        enabled: true
      });
    }
  }

  return {
    id: generateUUID(),
    name: config.environmentName!,
    values: variables,
    _postman_variable_scope: 'environment'
  };
}
