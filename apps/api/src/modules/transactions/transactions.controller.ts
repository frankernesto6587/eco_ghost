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
import { TransactionsService } from './transactions.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionQueryDto,
  DeleteTransactionDto,
} from './dto';
import { CurrentUser, OrgId, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  create(
    @OrgId() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(orgId, userId, dto);
  }

  @Get()
  findAll(@OrgId() orgId: string, @Query() query: TransactionQueryDto) {
    return this.transactionsService.findAll(orgId, query);
  }

  @Get('summary')
  getSummary(@OrgId() orgId: string, @Query() query: TransactionQueryDto) {
    return this.transactionsService.getSummary(orgId, query);
  }

  @Get(':id')
  findOne(@OrgId() orgId: string, @Param('id') id: string) {
    return this.transactionsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  remove(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() dto: DeleteTransactionDto,
  ) {
    return this.transactionsService.remove(orgId, id, dto.reason);
  }

  @Patch(':id/restore')
  @Roles(Role.OWNER)
  restore(@OrgId() orgId: string, @Param('id') id: string) {
    return this.transactionsService.restore(orgId, id);
  }
}
