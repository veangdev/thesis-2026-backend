import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { CoachingRepository } from './coaching.repository';

@Module({
  imports: [AuditModule],
  controllers: [CoachingController],
  providers: [CoachingService, CoachingRepository],
  exports: [CoachingService],
})
export class CoachingModule {}
