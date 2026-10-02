import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SiteInfoDto } from './site.dto';
import { SiteService } from './site.service';

@ApiTags('site')
@Controller({ path: 'site', version: '1' })
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @ApiOkResponse({ type: SiteInfoDto, description: 'Branches, hours, delivery fee and contact' })
  @ApiServiceUnavailableResponse({ description: 'The database is unavailable' })
  get(): Promise<SiteInfoDto> {
    return this.site.getSiteInfo();
  }
}
