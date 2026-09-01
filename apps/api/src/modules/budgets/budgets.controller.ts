import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BudgetsService } from './budgets.service';
import { CurrentUser, OrgId, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import {
  BudgetProgressQueryDto,
  BudgetQueryDto,
  CreateBudgetDto,
  UpdateBudgetDto,
} from './dto';

@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  findAll(@OrgId() orgId: string, @Query() query: BudgetQueryDto) {
    return this.budgetsService.findAll(orgId, query);
  }

  @Get('progress')
  @ApiOperation({ summary: 'Avance de cada presupuesto vigente en el mes' })
  getProgress(@OrgId() orgId: string, @Query() query: BudgetProgressQueryDto) {
    return this.budgetsService.getProgress(orgId, query);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  create(
    @OrgId() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBudgetDto,
  ) {
    return this.budgetsService.create(orgId, userId, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  update(
    @OrgId() orgId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(orgId, userId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(
    @OrgId() orgId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.budgetsService.remove(orgId, userId, id);
  }
}
