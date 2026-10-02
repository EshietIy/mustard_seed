import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/guards/public.decorator';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { MenuDto } from './menu.dto';
import { MenuService } from './menu.service';

@ApiTags('menu')
@Public()
@Controller({ path: 'menu', version: '1' })
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @ApiOkResponse({ type: MenuDto, description: 'The full menu, grouped into the four tabs' })
  @ApiServiceUnavailableResponse({ description: 'The database is unavailable' })
  get(): Promise<MenuDto> {
    return this.menu.getMenu();
  }
}
