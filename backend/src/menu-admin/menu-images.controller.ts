import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/guards/roles.decorator';
import { StrictThrottle } from '../throttling/throttling';
import { ImageUploadResultDto, StorageUsageDto } from './menu-admin.dto';
import {
  MenuImagesService,
  type StorageUsage,
  type UploadedFile,
  type UploadResult,
} from './menu-images.service';

/** The multipart field that carries the photo. */
export const IMAGE_FIELD = 'image';

const errorCodeOf = (err: unknown): string | undefined => {
  if (!(err instanceof HttpException)) return undefined;
  const body = err.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body
    ? String(body.code)
    : undefined;
};

/**
 * Dish photos (AGENT.md 3.1, slice 8): super admins only. Every upload and removal is logged
 * with its outcome; uploads also log the storage used and warn from 70% of the allowance.
 */
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Not allowed for this role' })
@Roles('super_admin')
@Controller({ path: 'admin', version: '1' })
export class MenuImagesController {
  constructor(private readonly images: MenuImagesService) {}

  @Post('menu-items/:itemId/image')
  @StrictThrottle()
  @UseInterceptors(FileInterceptor(IMAGE_FIELD))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [IMAGE_FIELD],
      properties: { [IMAGE_FIELD]: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: ImageUploadResultDto })
  @ApiNotFoundResponse({ description: 'MENU_ITEM_NOT_FOUND' })
  @ApiPayloadTooLargeResponse({ description: 'Larger than MAX_IMAGE_UPLOAD_MB' })
  @ApiUnsupportedMediaTypeResponse({
    description: 'UNSUPPORTED_IMAGE_TYPE or IMAGE_TYPE_MISMATCH',
  })
  @ApiUnprocessableEntityResponse({ description: 'IMAGE_UNREADABLE' })
  async upload(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @UploadedFileParam() file: UploadedFile | undefined,
    @Req() req: Request,
  ): Promise<UploadResult & { storage: StorageUsage | null }> {
    const actor = req.user as AuthenticatedUser;
    const base = {
      event: 'menu_item.image_uploaded',
      actorUserId: actor.id,
      itemId,
      originalBytes: file?.size ?? 0,
    };
    let result: UploadResult;
    try {
      result = await this.images.upload(actor, itemId, file, requestIdOf(req));
    } catch (err) {
      this.logFailure(req, base, err, 'Dish photo upload failed');
      throw err;
    }
    const storage = await this.readUsage(req);
    req.log.info(
      {
        ...base,
        outcome: 'SUCCESS',
        ...result.sizes,
        oldFilesRemoved: result.oldFilesRemoved,
        storagePercent: storage?.percent ?? null,
      },
      'Dish photo uploaded',
    );
    if (storage?.nearLimit) {
      req.log.warn(
        {
          event: 'storage.near_limit',
          storagePercent: storage.percent,
          usedBytes: storage.usedBytes,
        },
        'Photo storage is past 70% of the plan allowance',
      );
    }
    return { ...result, storage };
  }

  @Delete('menu-items/:itemId/image')
  @HttpCode(204)
  @StrictThrottle()
  @ApiNoContentResponse({ description: 'Photo removed; the dish shows "Photo coming"' })
  @ApiNotFoundResponse({ description: 'MENU_ITEM_NOT_FOUND or IMAGE_NOT_FOUND' })
  async remove(@Param('itemId', ParseUUIDPipe) itemId: string, @Req() req: Request): Promise<void> {
    const actor = req.user as AuthenticatedUser;
    const base = { event: 'menu_item.image_removed', actorUserId: actor.id, itemId };
    try {
      await this.images.remove(actor, itemId, requestIdOf(req));
    } catch (err) {
      this.logFailure(req, base, err, 'Dish photo removal failed');
      throw err;
    }
    req.log.info({ ...base, outcome: 'SUCCESS' }, 'Dish photo removed');
  }

  @Get('storage-usage')
  @ApiOkResponse({ type: StorageUsageDto })
  usage(): Promise<StorageUsage> {
    return this.images.usage();
  }

  private async readUsage(req: Request): Promise<StorageUsage | null> {
    try {
      return await this.images.usage();
    } catch (err) {
      req.log.error(
        { event: 'storage.usage', outcome: 'FAILED', err },
        'Could not read storage use',
      );
      return null;
    }
  }

  /** Expected refusals at warn, server and upstream failures at error (AGENT.md 6). */
  private logFailure(req: Request, base: object, err: unknown, msg: string): void {
    const status = err instanceof HttpException ? err.getStatus() : 500;
    const fields = {
      ...base,
      outcome: 'FAILED',
      statusCode: status,
      errorCode: errorCodeOf(err),
      reason: err instanceof Error ? err.message : String(err),
    };
    if (status >= 500) req.log.error(fields, msg);
    else req.log.warn(fields, msg);
  }
}

// pino-http always assigns a string request id (see logging/http-logger.ts).
const requestIdOf = (req: Request): string => (typeof req.id === 'string' ? req.id : '');
