import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  await prisma.user.upsert({
    where: { email: 'coordinator@pnc.edu' },
    update: {},
    create: {
      name: 'Program Coordinator',
      email: 'coordinator@pnc.edu',
      passwordHash,
      role: 'program_coordinator',
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'facilitator@pnc.edu' },
    update: {},
    create: {
      name: 'Demo Facilitator',
      email: 'facilitator@pnc.edu',
      passwordHash,
      role: 'facilitator',
      expertiseTags: ['communication', 'leadership'],
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'student@pnc.edu' },
    update: {},
    create: {
      name: 'Demo Self-Assessor',
      email: 'student@pnc.edu',
      passwordHash,
      role: 'self_assessor',
      isActive: true,
    },
  });

  console.log('Seed completed: coordinator, facilitator, student created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
