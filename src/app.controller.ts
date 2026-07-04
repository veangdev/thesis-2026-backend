import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  /** Send visitors hitting the bare root to the API documentation. */
  @Public()
  @Get()
  @Redirect('/api/docs', 302)
  @ApiExcludeEndpoint()
  root(): void {}
}
