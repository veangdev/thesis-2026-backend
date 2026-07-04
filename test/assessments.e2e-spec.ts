import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaClient } from '../generated/prisma/client';

const PREFIX = '/api/v1';
const PASSWORD = 'Password123!';

/**
 * Exercises the full assessment lifecycle end to end:
 * coordinator setup → period open (auto-generates drafts) → student self-submit
 * → mentor review + complete → coaching flag on a weak agreed score.
 */
describe('Assessment lifecycle (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL as string),
  });

  const unique = Date.now();
  const coordinatorEmail = `coord-${unique}@pnc.edu`;
  const facilitatorEmail = `fac-${unique}@pnc.edu`;
  const studentEmail = `stu-${unique}@pnc.edu`;

  const login = async (email: string): Promise<string> => {
    const res = await request(server)
      .post(`${PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    const body = res.body as { accessToken: string };
    return body.accessToken;
  };

  let coordinatorToken: string;
  let cohortId: string;
  let dimensionId: string;
  let studentId: string;
  let facilitatorId: string;
  let assessmentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    server = app.getHttpServer();

    // Bootstrap a coordinator directly (POST /users is coordinator-only).
    await prisma.user.create({
      data: {
        name: 'E2E Coordinator',
        email: coordinatorEmail,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        role: 'program_coordinator',
      },
    });
    coordinatorToken = await login(coordinatorEmail);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const asCoordinator = () =>
    ({ Authorization: `Bearer ${coordinatorToken}` }) as Record<string, string>;

  it('coordinator creates a cohort with a scale of 5', async () => {
    const res = await request(server)
      .post(`${PREFIX}/cohorts`)
      .set(asCoordinator())
      .send({
        name: `E2E Cohort ${unique}`,
        startDate: '2026-01-01T00:00:00.000Z',
        expectedEndDate: '2028-01-01T00:00:00.000Z',
        scoringScaleMax: 5,
      })
      .expect(201);
    cohortId = res.body.id;
    expect(res.body.scoringScaleMax).toBe(5);
  });

  it('coordinator adds a dimension to the cohort', async () => {
    const res = await request(server)
      .post(`${PREFIX}/cohorts/${cohortId}/dimensions`)
      .set(asCoordinator())
      .send({ name: 'Communication', order: 0 })
      .expect(201);
    dimensionId = res.body.id;
  });

  it('coordinator bulk-creates a student in the cohort', async () => {
    const res = await request(server)
      .post(`${PREFIX}/users/bulk`)
      .set(asCoordinator())
      .send({
        cohortId,
        users: [
          {
            name: 'E2E Student',
            email: studentEmail,
            password: PASSWORD,
            role: 'self_assessor',
          },
        ],
      })
      .expect(201);
    studentId = res.body[0].id;
  });

  it('coordinator creates a facilitator and assigns the student', async () => {
    const fac = await request(server)
      .post(`${PREFIX}/users`)
      .set(asCoordinator())
      .send({
        name: 'E2E Facilitator',
        email: facilitatorEmail,
        password: PASSWORD,
        role: 'facilitator',
      })
      .expect(201);
    facilitatorId = fac.body.id;

    await request(server)
      .post(`${PREFIX}/assignments`)
      .set(asCoordinator())
      .send({ facilitatorId, selfAssessorId: studentId, cohortId })
      .expect(201);
  });

  it('opening a period generates a draft assessment for the student', async () => {
    const period = await request(server)
      .post(`${PREFIX}/cohorts/${cohortId}/periods`)
      .set(asCoordinator())
      .send({
        name: 'Cycle 1',
        startDate: '2026-02-01T00:00:00.000Z',
        endDate: '2026-02-28T00:00:00.000Z',
      })
      .expect(201);

    await request(server)
      .patch(`${PREFIX}/periods/${period.body.id}`)
      .set(asCoordinator())
      .send({ status: 'open' })
      .expect(200);

    const studentToken = await login(studentEmail);
    const list = await request(server)
      .get(`${PREFIX}/assessments?mine=true`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .expect(200);

    expect(list.body.data).toHaveLength(1);
    assessmentId = list.body.data[0].id;
    expect(list.body.data[0].status).toBe('draft');
    expect(list.body.data[0].scores).toHaveLength(1);
    expect(list.body.data[0].scores[0].dimensionId).toBe(dimensionId);
  });

  it('student saves and submits the self-assessment', async () => {
    const studentToken = await login(studentEmail);

    await request(server)
      .patch(`${PREFIX}/assessments/${assessmentId}/self`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .send({
        scores: [
          { dimensionId, selfScore: 4, selfReflection: 'Improving steadily' },
        ],
      })
      .expect(200);

    const submitted = await request(server)
      .post(`${PREFIX}/assessments/${assessmentId}/self/submit`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .expect(200);
    expect(submitted.body.status).toBe('self_submitted');
  });

  it('mentor reviews, completes, and a weak agreed score is flagged for coaching', async () => {
    const facilitatorToken = await login(facilitatorEmail);

    await request(server)
      .patch(`${PREFIX}/assessments/${assessmentId}/mentor`)
      .set({ Authorization: `Bearer ${facilitatorToken}` })
      .send({
        scores: [
          {
            dimensionId,
            mentorScore: 2,
            agreedScore: 2,
            mentorNote: 'Needs support here',
          },
        ],
      })
      .expect(200);

    const completed = await request(server)
      .post(`${PREFIX}/assessments/${assessmentId}/mentor/submit`)
      .set({ Authorization: `Bearer ${facilitatorToken}` })
      .expect(200);

    expect(completed.body.status).toBe('completed');
    // agreedScore 2 ≤ 40% of scale (5) → coaching recommended.
    expect(completed.body.scores[0].coachingRecommended).toBe(true);
  });

  it('exposes gap analytics (self vs mentor) for the assessment', async () => {
    const res = await request(server)
      .get(`${PREFIX}/analytics/gap/${assessmentId}`)
      .set(asCoordinator())
      .expect(200);
    expect(res.body.studentId).toBe(studentId);
    expect(res.body.dimensions[0].selfScore).toBe(4);
    expect(res.body.dimensions[0].mentorScore).toBe(2);
    expect(res.body.dimensions[0].selfMentorGap).toBe(-2);
  });

  it('computes student analytics with a needs-support zone', async () => {
    const res = await request(server)
      .get(`${PREFIX}/analytics/student/${studentId}`)
      .set(asCoordinator())
      .expect(200);
    expect(res.body.scaleMax).toBe(5);
    expect(res.body.periods).toHaveLength(1);
    expect(res.body.latest.zones[0].zone).toBe('needs_support');
  });

  it('lists the student as at-risk in cohort analytics', async () => {
    const res = await request(server)
      .get(`${PREFIX}/analytics/cohort/${cohortId}`)
      .set(asCoordinator())
      .expect(200);
    const body = res.body as {
      atRiskStudents: { studentId: string }[];
      completionRates: { completed: number }[];
    };
    expect(body.atRiskStudents.map((s) => s.studentId)).toContain(studentId);
    expect(body.completionRates[0].completed).toBe(1);
  });

  it('reports the completed assessment in the coordinator overview', async () => {
    const res = await request(server)
      .get(`${PREFIX}/analytics/overview`)
      .set(asCoordinator())
      .expect(200);
    expect(res.body.kpis.completedAssessments).toBeGreaterThanOrEqual(1);
  });

  it('delivers lifecycle notifications to the student and marks them read', async () => {
    const studentToken = await login(studentEmail);
    const list = await request(server)
      .get(`${PREFIX}/notifications?unread=true`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .expect(200);
    const body = list.body as { data: unknown[] };
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const read = await request(server)
      .patch(`${PREFIX}/notifications/read-all`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .expect(200);
    expect((read.body as { count: number }).count).toBeGreaterThanOrEqual(1);
  });

  it('lets a student create and list a personal goal', async () => {
    const studentToken = await login(studentEmail);
    const created = await request(server)
      .post(`${PREFIX}/goals`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .send({
        title: 'Improve communication',
        targetDimensionId: dimensionId,
        progressPercent: 10,
        milestones: [{ title: 'Join debate club' }],
      })
      .expect(201);
    expect((created.body as { studentId: string }).studentId).toBe(studentId);

    const list = await request(server)
      .get(`${PREFIX}/goals`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .expect(200);
    expect(
      (list.body as { data: unknown[] }).data.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('lets a facilitator schedule a coaching session with an action item', async () => {
    const facilitatorToken = await login(facilitatorEmail);
    const session = await request(server)
      .post(`${PREFIX}/coaching-sessions`)
      .set({ Authorization: `Bearer ${facilitatorToken}` })
      .send({
        title: '1:1 Communication coaching',
        scope: 'individual',
        scheduledAt: '2026-07-10T09:00:00.000Z',
        participantIds: [studentId],
        targetDimensionIds: [dimensionId],
      })
      .expect(201);
    const sessionBody = session.body as {
      id: string;
      participants: unknown[];
    };
    expect(sessionBody.participants).toHaveLength(1);

    await request(server)
      .post(`${PREFIX}/coaching-sessions/${sessionBody.id}/action-items`)
      .set({ Authorization: `Bearer ${facilitatorToken}` })
      .send({ description: 'Practise the opening two minutes' })
      .expect(201);

    const list = await request(server)
      .get(`${PREFIX}/coaching-sessions`)
      .set({ Authorization: `Bearer ${facilitatorToken}` })
      .expect(200);
    expect(
      (list.body as { data: unknown[] }).data.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('records coordinator mutations in the audit log', async () => {
    await request(server)
      .post(`${PREFIX}/goals`)
      .set(asCoordinator())
      .send({ title: 'Coordinator-set goal', studentId })
      .expect(201);

    const logs = await request(server)
      .get(`${PREFIX}/audit-logs`)
      .set(asCoordinator())
      .expect(200);
    const body = logs.body as { data: { entity: string }[] };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.some((l) => l.entity === 'Goal')).toBe(true);
  });

  it('forbids a student from another student’s assessment scope', async () => {
    const studentToken = await login(studentEmail);
    // A facilitator-only action must be rejected for a self_assessor.
    await request(server)
      .patch(`${PREFIX}/assessments/${assessmentId}/mentor`)
      .set({ Authorization: `Bearer ${studentToken}` })
      .send({ scores: [{ dimensionId, agreedScore: 5 }] })
      .expect(403);
  });
});
