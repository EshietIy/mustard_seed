import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { StrictThrottle } from '../../src/throttling/throttling';

class EchoDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

/** Routes that exist only in the BDD suite, to exercise cross-cutting behaviour. */
@Controller({ path: '__test', version: '1' })
class TestSupportController {
  @Get('boom')
  boom(): never {
    throw new Error('kaboom: secret internal detail');
  }

  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }

  @Post('strict')
  @StrictThrottle()
  strict(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [TestSupportController] })
export class TestSupportModule {}
