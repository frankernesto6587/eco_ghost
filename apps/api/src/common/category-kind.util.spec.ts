import { BadRequestException } from '@nestjs/common';
import { categoryFits } from '@ecoghost/shared';
import { assertCategoryFits } from './category-kind.util';

const db = (category: { name: string; kind: string } | null) =>
  ({ category: { findFirst: jest.fn().mockResolvedValue(category) } }) as any;

describe('tipo de categoria', () => {
  it('cada tipo vale solo para su movimiento; los dos, para gasto e ingreso', () => {
    expect(categoryFits('EXPENSE', 'EXPENSE')).toBe(true);
    expect(categoryFits('EXPENSE', 'INCOME')).toBe(false);
    expect(categoryFits('INCOME', 'INCOME')).toBe(true);
    expect(categoryFits('INCOME', 'EXPENSE')).toBe(false);
    expect(categoryFits('BOTH', 'EXPENSE')).toBe(true);
    expect(categoryFits('BOTH', 'INCOME')).toBe(true);
    expect(categoryFits('BOTH', 'TRANSFER')).toBe(false);
    expect(categoryFits('BOTH', 'EXCHANGE')).toBe(false);
  });

  it('Salario no entra en un gasto', async () => {
    await expect(assertCategoryFits(db({ name: 'Salario', kind: 'INCOME' }), 'org', 'c1', 'EXPENSE')).rejects.toThrow(
      '"Salario" es una categoría de ingreso; elige una de gasto',
    );
    await expect(assertCategoryFits(db({ name: 'Salario', kind: 'INCOME' }), 'org', 'c1', 'INCOME')).resolves.toBeUndefined();
  });

  it('las transferencias y los cambios no llevan categoria', async () => {
    const d = db({ name: 'Prestamos', kind: 'BOTH' });
    await expect(assertCategoryFits(d, 'org', 'c1', 'TRANSFER')).rejects.toThrow(BadRequestException);
    await expect(assertCategoryFits(d, 'org', 'c1', 'EXCHANGE')).rejects.toThrow('no llevan categoría');
    // Sin categoria no hay nada que comprobar.
    await expect(assertCategoryFits(d, 'org', null, 'TRANSFER')).resolves.toBeUndefined();
    expect(d.category.findFirst).not.toHaveBeenCalled();
  });

  it('una categoria de otra organizacion no vale', async () => {
    await expect(assertCategoryFits(db(null), 'org', 'c1', 'EXPENSE')).rejects.toThrow('Category not found');
  });
});
