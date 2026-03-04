import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

export interface CategoryWithChildren {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  orgId: string;
  children: CategoryWithChildren[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, orgId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category with id ${dto.parentId} not found`);
      }
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        parentId: dto.parentId,
        orgId,
      },
    });
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

    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, orgId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category with id ${dto.parentId} not found`);
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: dto,
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
