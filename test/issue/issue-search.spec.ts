import { describe, expect, it, vi } from 'vitest';
import { buildSearchFilter, escapeLike } from '../../src/issue/issue-search.js';

// Evita cargar el cliente real de Prisma (aquí solo se usa como tipo)
vi.mock('../generated/prisma/client', () => ({ Prisma: {} }));

const textMatch = (term: string) => ({
  OR: [
    { title: { contains: term, mode: 'insensitive' } },
    { description: { contains: term, mode: 'insensitive' } },
  ],
});

describe('escapeLike', () => {
  it('escapa %, _ y la barra invertida', () => {
    expect(escapeLike('100%_\\')).toBe('100\\%\\_\\\\');
  });

  it('no modifica el texto normal', () => {
    expect(escapeLike('login móvil')).toBe('login móvil');
  });
});

describe('buildSearchFilter', () => {
  it('busca una palabra en título y descripción sin distinguir mayúsculas', () => {
    expect(buildSearchFilter('login')).toEqual({ AND: [textMatch('login')] });
  });

  it('exige todas las palabras e ignora espacios repetidos', () => {
    expect(buildSearchFilter('login   móvil  api')).toEqual({
      AND: [textMatch('login'), textMatch('móvil'), textMatch('api')],
    });
  });

  it('limita el número de palabras a 5', () => {
    const filter = buildSearchFilter('a b c d e f g');

    expect((filter.AND as unknown[]).length).toBe(5);
  });

  it('escapa los comodines de cada palabra', () => {
    expect(buildSearchFilter('100% snake_case')).toEqual({
      AND: [textMatch('100\\%'), textMatch('snake\\_case')],
    });
  });

  it('reconoce una clave de incidencia y también busca el texto', () => {
    expect(buildSearchFilter('tkr-12')).toEqual({
      OR: [
        { AND: [textMatch('tkr-12')] },
        { number: 12, project: { key: 'TKR' } },
      ],
    });
  });

  it('normaliza la clave a mayúsculas sea cual sea la capitalización', () => {
    const filter = buildSearchFilter('TkR-7');

    expect(filter.OR).toContainEqual({ number: 7, project: { key: 'TKR' } });
  });

  it.each(['tkr-', 'tkr-abc', 'a-1', 'tkr-9999999999', 'error tkr-1'])(
    'no trata "%s" como una clave de incidencia',
    (q) => {
      const filter = buildSearchFilter(q);

      expect(filter.OR).toBeUndefined();
      expect(filter.AND).toBeDefined();
    },
  );
});
