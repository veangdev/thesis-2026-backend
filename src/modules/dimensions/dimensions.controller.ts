import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { DimensionsService } from './dimensions.service';
import { CreateDimensionDto } from './dto/create-dimension.dto';
import { UpdateDimensionDto } from './dto/update-dimension.dto';
import { Dimension } from '../../../generated/prisma/client';

@ApiTags('dimensions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller()
export class DimensionsController {
  constructor(private readonly dimensionsService: DimensionsService) {}

  @Post('cohorts/:cohortId/dimensions')
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a dimension to a cohort (Program Coordinator)',
  })
  @ApiCreatedResponse({ description: 'The created dimension' })
  create(
    @Param('cohortId') cohortId: string,
    @Body() dto: CreateDimensionDto,
  ): Promise<Dimension> {
    return this.dimensionsService.create(cohortId, dto);
  }

  @Get('cohorts/:cohortId/dimensions')
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({ summary: "List a cohort's dimensions" })
  @ApiOkResponse({ description: 'Dimensions ordered by display order' })
  findByCohort(@Param('cohortId') cohortId: string): Promise<Dimension[]> {
    return this.dimensionsService.findByCohort(cohortId);
  }

  @Patch('dimensions/:id')
  @Roles(Role.program_coordinator)
  @ApiOperation({ summary: 'Rename or reconfigure a dimension' })
  @ApiOkResponse({ description: 'The updated dimension' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDimensionDto,
  ): Promise<Dimension> {
    return this.dimensionsService.update(id, dto);
  }

  @Delete('dimensions/:id')
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate a dimension (soft — keeps historical scores)',
  })
  @ApiNoContentResponse({ description: 'Dimension deactivated' })
  deactivate(@Param('id') id: string): Promise<void> {
    return this.dimensionsService.deactivate(id);
  }
}
