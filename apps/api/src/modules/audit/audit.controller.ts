import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { OrgId } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get(':entityId')
  findByEntity(
    @OrgId() orgId: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.findByEntity(orgId, entityId);
  }
}
