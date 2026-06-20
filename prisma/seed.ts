import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await bcrypt.hash('Admin@1234', 12);

  await prisma.user.upsert({
    where: { email: 'admin@pnc.edu.kh' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@pnc.edu.kh',
      password,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { email: 'mentor@pnc.edu.kh' },
    update: {},
    create: {
      name: 'Demo Mentor',
      email: 'mentor@pnc.edu.kh',
      password,
      role: 'MENTOR',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { email: 'student@pnc.edu.kh' },
    update: {},
    create: {
      name: 'Demo Student',
      email: 'student@pnc.edu.kh',
      password,
      role: 'STUDENT',
      status: 'ACTIVE',
    },
  });

  console.log('Seed completed: admin, mentor, student created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
