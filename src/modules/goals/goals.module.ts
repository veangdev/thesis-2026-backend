import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AuditModule } from '../audit/audit.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { GoalsRepository } from './goals.repository';

@Module({
  imports: [UsersModule, AssignmentsModule, AuditModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsRepository],
  exports: [GoalsService],
})
export class GoalsModule {}
