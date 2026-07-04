import { Module } from '@nestjs/common';
import { CohortsModule } from '../cohorts/cohorts.module';
import { DimensionsController } from './dimensions.controller';
import { DimensionsService } from './dimensions.service';
import { DimensionsRepository } from './dimensions.repository';

@Module({
  imports: [CohortsModule],
  controllers: [DimensionsController],
  providers: [DimensionsService, DimensionsRepository],
  exports: [DimensionsService, DimensionsRepository],
})
export class DimensionsModule {}
