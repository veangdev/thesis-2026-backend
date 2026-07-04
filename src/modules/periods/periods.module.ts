import { Module } from '@nestjs/common';
import { CohortsModule } from '../cohorts/cohorts.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { PeriodsController } from './periods.controller';
import { PeriodsService } from './periods.service';
import { PeriodsRepository } from './periods.repository';

@Module({
  imports: [CohortsModule, AssessmentsModule],
  controllers: [PeriodsController],
  providers: [PeriodsService, PeriodsRepository],
  exports: [PeriodsService, PeriodsRepository],
})
export class PeriodsModule {}
