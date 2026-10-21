import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

export interface CategoryWithChildren {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  isAdjustment: boolean;
  kind: CategoryKind;
  parentId: string | null;
  orgId: string;
  children: CategoryWithChildren[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateCategoryDto) {
    // Un ajuste puede sumar o restar saldo: por defecto vale para los dos.
    let kind = dto.kind ?? (dto.isAdjustment ? CategoryKind.BOTH : CategoryKind.EXPENSE);
    if (dto.parentId) {
      kind = await this.parentKind(orgId, dto.parentId, dto.kind);
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        isAdjustment: dto.isAdjustment ?? false,
        kind,
        parentId: dto.parentId,
        orgId,
      },
    });
  }

  /** Una subcategoria lleva el tipo de su grupo. */
  private async parentKind(orgId: string, parentId: string, wanted?: CategoryKind) {
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, orgId },
    });
    if (!parent) {
      throw new NotFoundException(`Parent category with id ${parentId} not found`);
    }
    if (wanted && wanted !== parent.kind) {
      throw new BadRequestException('Una subcategoría tiene el tipo de su grupo: cámbialo en el grupo');
    }
    return parent.kind;
  }

  /**
   * Cambiar el tipo de un grupo no puede dejar fuera lo ya anotado: si un grupo
   * con gastos pasa a ser de ingreso, esos gastos quedarian con una categoria
   * que no les toca. Tampoco puede pasar a ingreso con presupuestos (son de gasto).
   */
  private async assertKindFree(orgId: string, ids: string[], kind: CategoryKind) {
    if (kind === CategoryKind.BOTH) return;
    const wrong = kind === CategoryKind.INCOME ? 'EXPENSE' : 'INCOME';
    const n = await this.prisma.transaction.count({
      where: { orgId, categoryId: { in: ids }, type: wrong, deletedAt: null },
    });
    if (n) {
      const what = wrong === 'EXPENSE' ? (n === 1 ? 'un gasto' : `${n} gastos`) : n === 1 ? 'un ingreso' : `${n} ingresos`;
      throw new ConflictException(`Hay ${what} con esta categoría o sus subcategorías: cámbialos de categoría antes`);
    }
    if (kind === CategoryKind.INCOME && (await this.prisma.budget.count({ where: { orgId, categoryId: { in: ids } } }))) {
      throw new ConflictException('Esta categoría tiene presupuestos, y los presupuestos son de gasto: bórralos antes');
    }
  }

  /** La categoria y todas las que cuelgan de ella. */
  private async subtreeIds(orgId: string, id: string) {
    const all = await this.prisma.category.findMany({ where: { orgId }, select: { id: true, parentId: true } });
    const ids = [id];
    for (let i = 0; i < ids.length; i++) {
      for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
    }
    return ids;
  }

  async findAll(orgId: string): Promise<CategoryWithChildren[]> {
    const categories = await this.prisma.category.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });

    const categoryMap = new Map<string, CategoryWithChildren>();
    const roots: CategoryWithChildren[] = [];

    // First pass: create map entries with empty children arrays
    for (const cat of categories) {
      categoryMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        isAdjustment: cat.isAdjustment,
        kind: cat.kind,
        parentId: cat.parentId,
        orgId: cat.orgId,
        children: [],
      });
    }

    // Second pass: build tree
    for (const cat of categories) {
      const node = categoryMap.get(cat.id)!;
      if (cat.parentId && categoryMap.has(cat.parentId)) {
        categoryMap.get(cat.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findOne(orgId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, orgId },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  async update(orgId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, orgId },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    // Al moverla a otro grupo toma su tipo; en un grupo, el tipo baja a todo el subarbol.
    const parentId = dto.parentId !== undefined ? dto.parentId : category.parentId;
    if (parentId === id) throw new BadRequestException('Una categoría no puede colgar de sí misma');
    const kind = parentId ? await this.parentKind(orgId, parentId, dto.kind) : (dto.kind ?? category.kind);
    const ids = kind !== category.kind ? await this.subtreeIds(orgId, id) : [];
    if (ids.length) await this.assertKindFree(orgId, ids, kind);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: { ...dto, kind },
      });
      if (ids.length) await tx.category.updateMany({ where: { id: { in: ids } }, data: { kind } });
      return updated;
    });
  }

  async remove(orgId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, orgId },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    // Transactions referencing this category will have categoryId set to null
    // due to onDelete: SetNull in the schema.
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
