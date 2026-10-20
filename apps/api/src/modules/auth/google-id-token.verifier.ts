import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Verifica ID tokens de Google (firma, expiración, emisor y audiencia).
 *
 * La app Android pide el token con `serverClientId` = cliente web, así que la
 * audiencia es GOOGLE_CLIENT_ID. GOOGLE_MOBILE_AUDIENCES (separadas por comas)
 * queda para otros clientes, p. ej. iOS.
 */
@Injectable()
export class GoogleIdTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(config: ConfigService) {
    const extra = config.get<string>('GOOGLE_MOBILE_AUDIENCES', '');
    this.audiences = [config.getOrThrow<string>('GOOGLE_CLIENT_ID'), ...extra.split(',')]
      .map((a) => a.trim())
      .filter(Boolean);
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    // Sin email verificado no se puede enlazar por email con una cuenta existente
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    return {
      providerId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split('@')[0],
      avatarUrl: payload.picture ?? null,
    };
  }
}
