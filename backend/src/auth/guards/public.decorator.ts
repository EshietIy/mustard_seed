import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:public';

/** Opts a route out of the default "signed in" requirement. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
