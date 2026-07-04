import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: '.env',
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
  ],
  controllers: [AppController],
})
export class AppModule {}
