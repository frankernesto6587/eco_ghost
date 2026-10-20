import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, createSign } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleIdTokenVerifier } from './google-id-token.verifier';

const WEB_CLIENT = 'web-client.apps.googleusercontent.com';
const IOS_CLIENT = 'ios-client.apps.googleusercontent.com';

// ID tokens firmados de verdad con una clave propia; solo se sustituyen los
// certificados que Google publicaria, asi que se prueba la verificacion real.
const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims: Record<string, unknown> = {}, key = google.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: 'https://accounts.google.com',
    aud: WEB_CLIENT,
    sub: '1234567890',
    email: 'Frank@Example.com',
    email_verified: true,
    name: 'Frank',
    picture: 'https://example.com/a.png',
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const data = `${b64({ alg: 'RS256', typ: 'JWT', kid: KID })}.${b64(body)}`;
  const signature = createSign('RSA-SHA256').update(data).sign(key, 'base64url');
  return `${data}.${signature}`;
}

beforeAll(() => {
  jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
    certs: { [KID]: google.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
  } as never);
});
afterAll(() => jest.restoreAllMocks());

function verifier(extraAudiences?: string) {
  const values: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: WEB_CLIENT,
    GOOGLE_MOBILE_AUDIENCES: extraAudiences,
  };
  const config = {
    get: (k: string, def?: string) => values[k] ?? def,
    getOrThrow: (k: string) => values[k],
  } as unknown as ConfigService;
  return new GoogleIdTokenVerifier(config);
}

describe('GoogleIdTokenVerifier', () => {
  it('accepts a valid token for the web client and returns the profile', async () => {
    await expect(verifier().verify(idToken())).resolves.toEqual({
      providerId: '1234567890',
      email: 'frank@example.com',
      name: 'Frank',
      avatarUrl: 'https://example.com/a.png',
    });
  });

  it.each([
    ['another audience', idToken({ aud: 'someone-else.apps.googleusercontent.com' })],
    ['an expired token', idToken({ iat: 1000, exp: 2000 })],
    ['a foreign issuer', idToken({ iss: 'https://evil.example.com' })],
    ['a signature from another key', idToken({}, attacker.privateKey)],
    ['garbage', 'not-a-jwt'],
  ])('rejects %s', async (_case, token) => {
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unverified email (it would allow taking over an account by email)', async () => {
    await expect(verifier().verify(idToken({ email_verified: false }))).rejects.toThrow(
      'Google account email is not verified',
    );
  });

  it('accepts the extra audiences from GOOGLE_MOBILE_AUDIENCES', async () => {
    const token = idToken({ aud: IOS_CLIENT });
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier(` ${IOS_CLIENT} ,`).verify(token)).resolves.toHaveProperty('email');
  });
});

describe('POST /auth/google/mobile', () => {
  function setup(existing: { byProvider?: object; byEmail?: object } = {}) {
    const tx = {
      user: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'new-user', ...data })) },
      organization: { create: jest.fn().mockResolvedValue({ id: 'new-org' }) },
      orgMember: { create: jest.fn() },
      category: { create: jest.fn().mockResolvedValue({ id: 'cat' }), createMany: jest.fn() },
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(existing.byProvider ?? null),
        findUnique: jest.fn().mockResolvedValue(existing.byEmail ?? null),
        update: jest.fn().mockImplementation(({ data }) => ({ ...existing.byEmail, ...data })),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    const authService = new AuthService(prisma as never, {} as never, {} as never);
    const login = jest.spyOn(authService, 'login').mockResolvedValue({ tokens: 'ok' } as never);
    const ctrl = new AuthController(authService, {} as ConfigService, verifier());
    return { ctrl, prisma, tx, login };
  }

  it('creates a new user with its own organization', async () => {
    const { ctrl, tx, login } = setup();
    await expect(ctrl.googleMobile({ idToken: idToken() })).resolves.toEqual({ tokens: 'ok' });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'frank@example.com', provider: 'GOOGLE', providerId: '1234567890', isVerified: true }),
    });
    expect(tx.orgMember.create).toHaveBeenCalledWith({ data: expect.objectContaining({ role: 'OWNER' }) });
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-user' }));
  });

  it('links an existing email/password account instead of duplicating it', async () => {
    const local = { id: 'local-user', email: 'frank@example.com', provider: 'LOCAL', avatarUrl: null };
    const { ctrl, prisma, tx, login } = setup({ byEmail: local });
    await ctrl.googleMobile({ idToken: idToken() });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'local-user' },
      data: expect.objectContaining({ provider: 'GOOGLE', providerId: '1234567890' }),
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-user' }));
  });

  it('does not touch the database when the token is invalid', async () => {
    const { ctrl, prisma, login } = setup();
    await expect(ctrl.googleMobile({ idToken: idToken({ aud: 'x' }) })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });
});
