import { Module } from '@nestjs/common';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { CoachingRepository } from './coaching.repository';

@Module({
  controllers: [CoachingController],
  providers: [CoachingService, CoachingRepository],
  exports: [CoachingService],
})
export class CoachingModule {}
