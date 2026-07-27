import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { GoalsRepository } from './goals.repository';

@Module({
  imports: [UsersModule, AssignmentsModule, NotificationsModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsRepository],
  exports: [GoalsService],
})
export class GoalsModule {}
