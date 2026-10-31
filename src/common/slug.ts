import { randomBytes } from 'node:crypto';

export const generateSlug = (name: string) =>
  `${name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${randomBytes(3).toString('hex')}`;
