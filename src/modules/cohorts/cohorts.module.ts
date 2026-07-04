import { Module } from '@nestjs/common';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { CohortsRepository } from './cohorts.repository';

@Module({
  controllers: [CohortsController],
  providers: [CohortsService, CohortsRepository],
  exports: [CohortsService, CohortsRepository],
})
export class CohortsModule {}
