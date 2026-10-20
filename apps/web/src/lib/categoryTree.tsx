import type { ReactNode } from 'react';
import { categoryFits } from '@ecoghost/shared';
import CategoryIcon from '@/components/common/CategoryIcon';
import type { Category } from '@/services/categories.service';

export interface CategoryTreeNode {
  id: string;
  title: ReactNode;
  value: string;
  name: string;
  children?: CategoryTreeNode[];
}

/**
 * Los grupos que valen para ese tipo de movimiento; sus subcategorias van con
 * ellos. Transferencias y cambios no llevan categoria.
 */
export function categoriesFor(categories: Category[], type: string | undefined): Category[] {
  if (type !== 'INCOME' && type !== 'EXPENSE') return [];
  return categories.filter((c) => categoryFits(c.kind, type));
}

/** Los ids de un arbol, con sus subcategorias. */
export function categoryIds(categories: Category[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: Category[]) => list.forEach((c) => (ids.add(c.id), walk(c.children ?? [])));
  walk(categories);
  return ids;
}

/**
 * Aplana el arbol de categorias al formato que espera TreeSelect,
 * con icono y color. Extraido de Transactions.tsx para reusarlo en el
 * drawer de presupuestos y en la asignacion masiva.
 */
export function flattenCategories(categories: Category[]): CategoryTreeNode[] {
  return categories.map((cat) => ({
    id: cat.id,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <CategoryIcon name={cat.icon} style={{ color: cat.color ?? 'var(--eco-fg3)' }} />
        {cat.name}
      </span>
    ),
    value: cat.id,
    name: cat.name,
    children: cat.children?.length ? flattenCategories(cat.children) : undefined,
  }));
}
