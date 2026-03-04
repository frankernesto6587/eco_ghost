import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // ─── POST /auth/register ──────────────────────────────────────────

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── POST /auth/login ─────────────────────────────────────────────

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  async login(@Req() req: FastifyRequest & { user: User }, @Body() _dto: LoginDto) {
    return this.authService.login(req.user);
  }

  // ─── POST /auth/refresh ───────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // ─── POST /auth/logout ────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate a refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  // ─── GET /auth/google ─────────────────────────────────────────────

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  async googleAuth(@Res() res: FastifyReply) {
    const clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const callbackUrl = this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL');
    const scope = encodeURIComponent('email profile');

    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&access_type=offline` +
      `&prompt=consent`;

    return res.status(302).redirect(url);
  }

  // ─── GET /auth/google/callback ────────────────────────────────────

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: FastifyReply,
  ) {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');

    if (error || !code) {
      return res.status(302).redirect(`${frontendUrl}/login?error=oauth_denied`);
    }

    try {
      // Exchange authorization code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
          client_secret: this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
          redirect_uri: this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return res.status(302).redirect(`${frontendUrl}/login?error=oauth_token_failed`);
      }

      // Fetch user profile from Google
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const profile = await profileRes.json();

      // Create or link user in our DB
      const user = await this.authService.validateOAuthUser({
        provider: 'GOOGLE',
        providerId: profile.id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.picture ?? null,
      });

      // Generate our own JWT tokens
      const { tokens } = await this.authService.login(user);

      const redirectUrl =
        `${frontendUrl}/auth/callback` +
        `?accessToken=${encodeURIComponent(tokens.accessToken)}` +
        `&refreshToken=${encodeURIComponent(tokens.refreshToken)}`;

      return res.status(302).redirect(redirectUrl);
    } catch (err) {
      console.error('Google OAuth callback error:', err);
      return res.status(302).redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  // ─── GET /auth/me ─────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile with organizations' })
  async me(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }
}
