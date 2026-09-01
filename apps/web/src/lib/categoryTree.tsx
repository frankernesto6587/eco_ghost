import type { ReactNode } from 'react';
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
