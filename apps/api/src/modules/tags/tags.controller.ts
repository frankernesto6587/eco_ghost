import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './dto';
import { OrgId, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('tags')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  create(@OrgId() orgId: string, @Body() dto: CreateTagDto) {
    return this.tagsService.create(orgId, dto);
  }

  @Get()
  findAll(@OrgId() orgId: string) {
    return this.tagsService.findAll(orgId);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  remove(@OrgId() orgId: string, @Param('id') id: string) {
    return this.tagsService.remove(orgId, id);
  }
}
