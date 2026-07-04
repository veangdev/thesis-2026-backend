import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaClient } from '../generated/prisma/client';

const PREFIX = '/api/v1';

describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL as string),
  });

  const unique = Date.now();
  const user = {
    name: 'E2E User',
    email: `e2e-${unique}@pnc.edu`,
    password: 'password123',
  };

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    httpServer = app.getHttpServer();

    // Users are provisioned by a coordinator; bootstrap a self-assessor directly.
    await prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        passwordHash: await bcrypt.hash(user.password, 4),
        role: 'self_assessor',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('redirects the root path to the Swagger docs', async () => {
    const res = await request(httpServer).get('/').expect(302);
    expect(res.headers.location).toBe('/api/docs');
  });

  it('GET /health is public and reports ok', async () => {
    const res = await request(httpServer).get(`${PREFIX}/health`).expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects login with an invalid payload (400 envelope)', async () => {
    const res = await request(httpServer)
      .post(`${PREFIX}/auth/login`)
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('logs in and returns tokens (no password leak)', async () => {
    const res = await request(httpServer)
      .post(`${PREFIX}/auth/login`)
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).not.toHaveProperty('passwordHash');
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('rejects a protected route without a token (401)', async () => {
    await request(httpServer).get(`${PREFIX}/users`).expect(401);
  });

  it('forbids a self_assessor from the coordinator-only user list (403)', async () => {
    await request(httpServer)
      .get(`${PREFIX}/users`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('returns the current user from /auth/me', async () => {
    const res = await request(httpServer)
      .get(`${PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.role).toBe('self_assessor');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('exchanges a refresh token for a new access token (non-rotating)', async () => {
    const refreshed = await request(httpServer)
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeDefined();
    // Contract: refresh returns only an access token.
    expect(refreshed.body.refreshToken).toBeUndefined();

    // The refresh token remains valid and can be reused.
    await request(httpServer)
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken })
      .expect(200);

    accessToken = refreshed.body.accessToken;
  });

  it('logs out the current user', async () => {
    await request(httpServer)
      .post(`${PREFIX}/auth/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('rejects the refresh token after logout (401)', async () => {
    await request(httpServer)
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken })
      .expect(401);
  });
});
