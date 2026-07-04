import { Module } from '@nestjs/common';
import { CohortsModule } from '../cohorts/cohorts.module';
import { DimensionsModule } from '../dimensions/dimensions.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { AssessmentsRepository } from './assessments.repository';

@Module({
  imports: [
    CohortsModule,
    DimensionsModule,
    AssignmentsModule,
    NotificationsModule,
  ],
  controllers: [AssessmentsController],
  providers: [AssessmentsService, AssessmentsRepository],
  exports: [AssessmentsService, AssessmentsRepository],
})
export class AssessmentsModule {}
