import { Controller, Delete, Get, Patch, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change user password' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto);
  }

  @Post('telegram-link')
  @ApiOperation({ summary: 'Generate a 6-digit code to link Telegram account' })
  generateTelegramLink(@CurrentUser('id') userId: string) {
    return this.usersService.generateTelegramLinkToken(userId);
  }

  @Get('telegram-link')
  @ApiOperation({ summary: 'Get Telegram link status' })
  getTelegramStatus(@CurrentUser('id') userId: string) {
    return this.usersService.getTelegramStatus(userId);
  }

  @Delete('telegram-link')
  @ApiOperation({ summary: 'Unlink Telegram account' })
  unlinkTelegram(@CurrentUser('id') userId: string) {
    return this.usersService.unlinkTelegram(userId);
  }
}
