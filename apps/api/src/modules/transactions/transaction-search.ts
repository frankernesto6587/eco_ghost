import { Prisma } from '@prisma/client';

/**
 * Busqueda de movimientos en todo el historial, sin distinguir mayusculas ni
 * tildes ("cafe" encuentra "Café"). Cada palabra tiene que aparecer en la
 * descripcion, la nota, la categoria o la cuenta; si lo buscado es un importe
 * ("6400", "6 400,50", "1.000") tambien encuentra los movimientos de ese importe.
 *
 * Las tildes se quitan con `translate` y no con la extension `unaccent`, que
 * pediria una migracion.
 */
const ACCENTED = 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç';
const PLAIN = 'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc';

const MAX_WORDS = 5;

/** Como lo deja `translate(...)` + `lower`, para comparar con lo de la base. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Las palabras de la busqueda, ya sin tildes. */
export function searchWords(q: string): string[] {
  return fold(q).split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

/**
 * Centavos si lo buscado es un importe; null si no. Acepta espacios de miles,
 * punto de miles ("1.000") y coma o punto decimal con uno o dos decimales.
 */
export function parseAmountQuery(q: string): number | null {
  const s = q.replace(/[\s  ]/g, '');
  let n: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) n = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) n = s.replace(',', '.');
  else return null;
  const cents = Math.round(parseFloat(n) * 100);
  return cents > 0 && cents <= 2_147_483_647 ? cents : null;
}

/** `%palabra%` para LIKE, con los comodines de lo escrito escapados. */
export function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const folded = (col: Prisma.Sql) => Prisma.sql`lower(translate(coalesce(${col}, ''), ${ACCENTED}, ${PLAIN}))`;

/** SQL que devuelve los ids de los movimientos de la organizacion que coinciden. */
export function searchSql(orgId: string, q: string): Prisma.Sql | null {
  const words = searchWords(q);
  const cents = parseAmountQuery(q);
  if (!words.length && cents == null) return null;

  const fields = [
    Prisma.sql`t."description"`,
    Prisma.sql`t."notes"`,
    Prisma.sql`c."name"`,
    Prisma.sql`a."name"`,
  ].map(folded);
  const text = words.map((w) => {
    const p = likePattern(w);
    return Prisma.sql`(${Prisma.join(fields.map((f) => Prisma.sql`${f} LIKE ${p}`), ' OR ')})`;
  });
  const conditions = [Prisma.join(text, ' AND ')];
  if (cents != null) conditions.push(Prisma.sql`t."amount" = ${cents}`);

  return Prisma.sql`
    SELECT t."id" FROM "transactions" t
    JOIN "accounts" a ON a."id" = t."accountId"
    LEFT JOIN "categories" c ON c."id" = t."categoryId"
    WHERE t."orgId" = ${orgId} AND (${Prisma.join(conditions, ' OR ')})`;
}
