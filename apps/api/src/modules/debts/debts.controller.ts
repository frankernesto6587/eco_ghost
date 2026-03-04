import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DebtsService } from './debts.service';
import { CreateDebtDto, UpdateDebtDto, AddPaymentDto, DebtQueryDto } from './dto';
import { CurrentUser, OrgId, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('debts')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  create(
    @OrgId() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDebtDto,
  ) {
    return this.debtsService.create(orgId, userId, dto);
  }

  @Get()
  findAll(@OrgId() orgId: string, @Query() query: DebtQueryDto) {
    return this.debtsService.findAll(orgId, query);
  }

  @Get(':id')
  findOne(@OrgId() orgId: string, @Param('id') id: string) {
    return this.debtsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDebtDto,
  ) {
    return this.debtsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  remove(@OrgId() orgId: string, @Param('id') id: string) {
    return this.debtsService.remove(orgId, id);
  }

  @Post(':id/payments')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  addPayment(
    @OrgId() orgId: string,
    @CurrentUser('id') userId: string,
    @Param('id') debtId: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.debtsService.addPayment(orgId, userId, debtId, dto);
  }
}
