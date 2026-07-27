import { Module } from '@nestjs/common';
import { NotificationRulesController } from './notification-rules.controller';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationRulesRepository } from './notification-rules.repository';

@Module({
  controllers: [NotificationRulesController],
  providers: [NotificationRulesService, NotificationRulesRepository],
  exports: [NotificationRulesService],
})
export class NotificationRulesModule {}
