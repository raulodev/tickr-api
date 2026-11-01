import { Prisma } from '../generated/prisma/client.js';

const MAX_TERMS = 5;
// Clave visible de una incidencia: TKR-12 (el número se limita para no desbordar el Int de la base de datos)
const ISSUE_KEY = /^([a-z][a-z0-9]{1,9})-(\d{1,9})$/i;

/** Prisma no escapa los comodines de LIKE: % y _ del usuario deben tratarse como texto literal */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export function buildSearchFilter(q: string): Prisma.IssueWhereInput {
  const terms = q.split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);

  // Todas las palabras deben aparecer, cada una en el título o en la descripción
  const text: Prisma.IssueWhereInput = {
    AND: terms.map((term): Prisma.IssueWhereInput => ({
      OR: [
        { title: { contains: escapeLike(term), mode: 'insensitive' } },
        { description: { contains: escapeLike(term), mode: 'insensitive' } },
      ],
    })),
  };

  const key = ISSUE_KEY.exec(q.trim());
  if (!key) return text;

  return {
    OR: [
      text,
      { number: Number(key[2]), project: { key: key[1].toUpperCase() } },
    ],
  };
}
