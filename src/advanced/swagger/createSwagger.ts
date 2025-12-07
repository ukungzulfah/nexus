import { SwaggerGenerator } from './SwaggerGenerator';
import { SwaggerConfig } from './types';

/**
 * Create swagger instance (legacy)
 * @deprecated Use swagger() plugin instead
 */


export function createSwagger(config: SwaggerConfig = {}): SwaggerGenerator {
  return new SwaggerGenerator(config);
}
