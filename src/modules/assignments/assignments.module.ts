import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentsRepository } from './assignments.repository';

@Module({
  imports: [UsersModule, CohortsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsRepository],
  exports: [AssignmentsService, AssignmentsRepository],
})
export class AssignmentsModule {}
