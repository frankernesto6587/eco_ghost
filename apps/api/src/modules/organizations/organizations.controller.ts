import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrgDto,
  UpdateOrgDto,
  JoinOrgDto,
  RegenerateTokenDto,
  UpdateRoleDto,
} from './dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrgDto,
  ) {
    return this.organizationsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all organizations the user belongs to' })
  async findAll(@CurrentUser('id') userId: string) {
    return this.organizationsService.findAllForUser(userId);
  }

  @Post('join')
  @ApiOperation({ summary: 'Join an organization using an invite token' })
  async join(
    @CurrentUser('id') userId: string,
    @Body() dto: JoinOrgDto,
  ) {
    return this.organizationsService.join(dto.token, userId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get organization details' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.organizationsService.findOne(id, userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Update organization (OWNER only)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrgDto,
  ) {
    return this.organizationsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete organization (OWNER only)' })
  async remove(@Param('id') id: string) {
    await this.organizationsService.remove(id);
  }

  @Post(':id/regenerate-token')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Regenerate invite token, optionally expel members (OWNER only)' })
  async regenerateToken(
    @Param('id') id: string,
    @Body() dto: RegenerateTokenDto,
  ) {
    return this.organizationsService.regenerateToken(id, dto.expelMemberIds);
  }

  @Post(':id/disconnect-telegram')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Disconnect Telegram from organization (OWNER only)' })
  async disconnectTelegram(@Param('id') id: string) {
    return this.organizationsService.disconnectTelegram(id);
  }

  @Get(':id/members')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'List all members of the organization' })
  async getMembers(@Param('id') id: string) {
    return this.organizationsService.getMembers(id);
  }

  @Patch(':id/members/:memberId')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a member role' })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    await this.organizationsService.removeMember(id, memberId);
  }
}
