import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';

const PREFIX = '/api/v1';

describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;

  const unique = Date.now();
  const newUser = {
    name: 'E2E User',
    email: `e2e-${unique}@pnc.edu.kh`,
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('redirects the root path to the Swagger docs', async () => {
    const res = await request(httpServer).get('/').expect(302);
    expect(res.headers.location).toBe('/docs');
  });

  it('GET /health is public and reports ok', async () => {
    const res = await request(httpServer).get(`${PREFIX}/health`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('rejects registration with invalid payload (400 envelope)', async () => {
    const res = await request(httpServer)
      .post(`${PREFIX}/auth/register`)
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('registers a new user and returns tokens (no password leak)', async () => {
    const res = await request(httpServer)
      .post(`${PREFIX}/auth/register`)
      .send(newUser)
      .expect(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user).not.toHaveProperty('password');
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('logs in with the new credentials', async () => {
    const res = await request(httpServer)
      .post(`${PREFIX}/auth/login`)
      .send({ email: newUser.email, password: newUser.password })
      .expect(200);
    expect(res.body.data.accessToken).toBeDefined();
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects a protected route without a token (401)', async () => {
    await request(httpServer).get(`${PREFIX}/users`).expect(401);
  });

  it('forbids a STUDENT from the admin-only user list (403)', async () => {
    await request(httpServer)
      .get(`${PREFIX}/users`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const refreshed = await request(httpServer)
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken })
      .expect(200);
    expect(refreshed.body.data.accessToken).toBeDefined();

    // The original refresh token must no longer be accepted after rotation.
    await request(httpServer)
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken })
      .expect(401);

    accessToken = refreshed.body.data.accessToken;
  });

  it('logs out the current user', async () => {
    await request(httpServer)
      .post(`${PREFIX}/auth/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
