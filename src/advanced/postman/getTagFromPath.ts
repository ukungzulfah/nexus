import { capitalize } from './capitalize';


export function getTagFromPath(path: string): string {
  const firstSegment = path.split('/').filter(Boolean)[0];
  if (firstSegment && !firstSegment.startsWith(':')) {
    return capitalize(firstSegment);
  }
  return 'General';
}
