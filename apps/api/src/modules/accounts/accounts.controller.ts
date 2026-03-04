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
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';
import { OrgId, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@OrgId() orgId: string, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(orgId, dto);
  }

  @Get()
  findAll(@OrgId() orgId: string) {
    return this.accountsService.findAll(orgId);
  }

  @Get(':id')
  findOne(@OrgId() orgId: string, @Param('id') id: string) {
    return this.accountsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(@OrgId() orgId: string, @Param('id') id: string) {
    return this.accountsService.remove(orgId, id);
  }
}
