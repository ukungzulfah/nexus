import { PostmanResponse } from './types';


export function buildResponses(responses: Record<number, string>, requestName: string): PostmanResponse[] {
  return Object.entries(responses).map(([code, description]) => ({
    name: `${requestName} - ${description}`,
    status: description,
    code: parseInt(code),
    body: JSON.stringify({ message: description }, null, 2)
  }));
}
