import { generateExampleFromZod } from './generateExampleFromZod';
import { PostmanBody } from './types';


export function buildBody(bodySchema: any): PostmanBody {
  const example = generateExampleFromZod(bodySchema);

  return {
    mode: 'raw',
    raw: JSON.stringify(example, null, 2),
    options: {
      raw: { language: 'json' }
    }
  };
}
