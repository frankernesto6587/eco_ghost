import { fold, likePattern, parseAmountQuery, searchSql, searchWords } from './transaction-search';

describe('busqueda de movimientos', () => {
  it('quita tildes y mayusculas como lo hace la base', () => {
    expect(fold('Café CON Leche')).toBe('cafe con leche');
    expect(fold('Baño Ñoño')).toBe('bano nono');
    expect(searchWords('  Cafe   del  Agro ')).toEqual(['cafe', 'del', 'agro']);
  });

  it('se queda con las primeras cinco palabras', () => {
    expect(searchWords('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('reconoce importes escritos de varias formas', () => {
    expect(parseAmountQuery('6400')).toBe(640000);
    expect(parseAmountQuery('6 400')).toBe(640000);
    expect(parseAmountQuery('6 400')).toBe(640000);
    expect(parseAmountQuery('6400,5')).toBe(640050);
    expect(parseAmountQuery('6400.50')).toBe(640050);
    expect(parseAmountQuery('1.000')).toBe(100000);
    expect(parseAmountQuery('1.000.000,25')).toBe(100000025);
  });

  it('lo que no es un importe no se busca como importe', () => {
    expect(parseAmountQuery('cafe')).toBeNull();
    expect(parseAmountQuery('6400 cafe')).toBeNull();
    expect(parseAmountQuery('0')).toBeNull();
    expect(parseAmountQuery('6,400,000')).toBeNull();
    expect(parseAmountQuery('99999999999')).toBeNull();
  });

  it('los comodines de LIKE escritos por el usuario se buscan tal cual', () => {
    expect(likePattern('50%')).toBe('%50\\%%');
    expect(likePattern('a_b')).toBe('%a\\_b%');
  });

  it('el SQL lleva la organizacion, cada palabra y el importe como parametros', () => {
    const sql = searchSql('org1', 'Café 6400')!;
    expect(sql.values).toContain('org1');
    expect(sql.values).toContain('%cafe%');
    expect(sql.values).toContain('%6400%');
    // "Café 6400" no es un importe: no compara amount
    expect(sql.sql).not.toContain('"amount"');

    const amount = searchSql('org1', '6 400')!;
    expect(amount.values).toContain(640000);
    expect(amount.sql).toContain('t."amount" =');
  });

  it('una busqueda vacia no filtra', () => {
    expect(searchSql('org1', '   ')).toBeNull();
  });
});
