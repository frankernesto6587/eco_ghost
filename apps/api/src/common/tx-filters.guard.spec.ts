import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guardian: que cuenta en saldos y estadisticas se decide solo en
 * `tx-filters.ts` (COUNTED / flowWhere / countedSql). Un `deletedAt: null`
 * suelto sobre movimientos contaria lo pendiente y lo rechazado.
 *
 * Los archivos de la lista usan `deletedAt: null` para buscar un registro
 * concreto (o sobre deudas), no para sumar. Si este test falla en un archivo
 * nuevo, usa COUNTED/flowWhere; si de verdad es una busqueda puntual, anadelo
 * aqui explicando por que.
 */
const ALLOWED = new Set([
  'common/tx-filters.ts', // la definicion
  'common/account-balance.util.ts', // suma pendientes a proposito (statuses)
  'common/org-refs.util.ts', // deudas
  'modules/transactions/transactions.service.ts', // buscar el movimiento a editar o borrar
  'modules/debts/debts.service.ts', // deudas y sus movimientos al borrar
  'modules/approvals/approvals.service.ts', // la bandeja trabaja con pendientes
  'modules/dashboard/dashboard.service.ts', // deudas, conteos de la bandeja y lista visible
  'modules/telegram/telegram.service.ts', // deudas
  'modules/categories/categories.service.ts', // al cambiar el tipo, cuenta tambien lo pendiente
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'prisma' ? [] : files(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('filtros de movimientos', () => {
  const root = join(__dirname, '..');
  const all = files(root).map((p) => ({ path: relative(root, p), text: readFileSync(p, 'utf8') }));

  it('nadie escribe su propio deletedAt: null fuera de los permitidos', () => {
    const offenders = all.filter((f) => /deletedAt:\s*null/.test(f.text) && !ALLOWED.has(f.path)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('el SQL a mano usa countedSql/flowSql', () => {
    const offenders = all
      .filter((f) => /"deletedAt"\s+IS\s+NULL/i.test(f.text) && f.path !== 'common/tx-filters.ts')
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
