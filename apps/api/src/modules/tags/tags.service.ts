import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateTagDto) {
    return this.prisma.tag.create({
      data: {
        name: dto.name,
        color: dto.color,
        orgId,
      },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.tag.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
  }

  async update(orgId: string, id: string, dto: UpdateTagDto) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, orgId },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with id ${id} not found`);
    }

    return this.prisma.tag.update({
      where: { id },
      data: dto,
    });
  }

  async remove(orgId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, orgId },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with id ${id} not found`);
    }

    return this.prisma.tag.delete({
      where: { id },
    });
  }
}
