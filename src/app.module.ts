import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { CohortsModule } from './modules/cohorts/cohorts.module';
import { DimensionsModule } from './modules/dimensions/dimensions.module';
import { PeriodsModule } from './modules/periods/periods.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { GoalsModule } from './modules/goals/goals.module';
import { CoachingModule } from './modules/coaching/coaching.module';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: '.env',
    }),
    // Generous global rate limit; auth routes tighten it further. Disabled
    // under tests so rapid sequential requests don't trip the limiter.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
    CohortsModule,
    DimensionsModule,
    PeriodsModule,
    AssignmentsModule,
    AssessmentsModule,
    NotificationsModule,
    AnalyticsModule,
    GoalsModule,
    CoachingModule,
    AuditModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
