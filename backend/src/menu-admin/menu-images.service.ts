import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { publicImageUrls, type ImageUrls } from '../common/image-urls';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import {
  detectImageType,
  ImageUnreadableError,
  processImage,
  type ImageType,
} from '../images/image-processing';
import { IMAGE_STORAGE, type ImageStorage } from '../images/image-storage';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import {
  MENU_ADMIN_REPOSITORY,
  type MenuAdminRepository,
  type MenuItemImage,
} from './menu-admin.repository';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

/** The parts of a multipart upload this service reads. */
export interface UploadedFile {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
}

export interface UploadResult {
  itemId: string;
  image: ImageUrls;
  sizes: { originalBytes: number; thumbBytes: number; fullBytes: number };
  /** False when the replaced photo's files could not be deleted (logged, not an error). */
  oldFilesRemoved: boolean;
}

export interface StorageUsage {
  usedBytes: number;
  allowanceBytes: number;
  /** One decimal place. */
  percent: number;
  /** At or past the point where the owner should be told (AGENT.md 3.1: about 70%). */
  nearLimit: boolean;
}

const NEAR_LIMIT_PERCENT = 70;
const MIME: Record<ImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const EXTENSIONS: Record<ImageType, string[]> = {
  jpeg: ['jpg', 'jpeg'],
  png: ['png'],
  webp: ['webp'],
};
/** Declared types browsers send when they don't know better; the contents decide instead. */
const GENERIC_TYPES = new Set(['', 'application/octet-stream']);

const filesOf = (path: string) => [`${path}/thumb.webp`, `${path}/full.webp`];

/**
 * Dish photos (AGENT.md 3.1, 5): checks the file by its contents, converts it to a WebP
 * thumbnail and full size, stores both under a new versioned key, then saves the key and
 * removes the replaced files. A failure part-way leaves no stray file or half-saved photo.
 */
@Injectable()
export class MenuImagesService {
  private readonly logger = new Logger(MenuImagesService.name);

  constructor(
    @Inject(MENU_ADMIN_REPOSITORY) private readonly repo: MenuAdminRepository,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
    @Inject(APP_CONFIG)
    private readonly config: Pick<
      AppConfig,
      'SUPABASE_URL' | 'SUPABASE_STORAGE_BUCKET' | 'IMAGE_STORAGE_ALLOWANCE_MB'
    >,
    @Inject(ORDERS_REPOSITORY) private readonly audit: Pick<OrdersRepository, 'recordAudit'>,
  ) {}

  async upload(
    actor: Actor,
    itemId: string,
    file: UploadedFile | undefined,
    correlationId: string,
  ): Promise<UploadResult> {
    if (!file || file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'IMAGE_REQUIRED',
        message: 'Choose a photo to upload.',
      });
    }
    checkType(file);
    const item = await this.findItem(itemId);

    let processed;
    try {
      processed = await processImage(file.buffer);
    } catch (err) {
      if (!(err instanceof ImageUnreadableError)) throw err;
      throw new UnprocessableEntityException({
        code: 'IMAGE_UNREADABLE',
        message: 'We couldn’t read that photo. It may be damaged; try another one.',
      });
    }

    const path = `menu-items/${itemId}/${randomUUID()}`;
    const [thumbKey, fullKey] = filesOf(path) as [string, string];
    const stored: string[] = [];
    try {
      await this.storage.put(thumbKey, processed.thumb, MIME.webp);
      stored.push(thumbKey);
      await this.storage.put(fullKey, processed.full, MIME.webp);
      stored.push(fullKey);
      await this.repo.setImagePath(itemId, path);
    } catch (err) {
      await this.discard(stored);
      throw err;
    }

    const oldFilesRemoved = await this.removeFiles(item.imagePath);
    const sizes = {
      originalBytes: file.size,
      thumbBytes: processed.thumb.length,
      fullBytes: processed.full.length,
    };
    await this.record(actor, 'menu_item.image_uploaded', correlationId, {
      itemId,
      imagePath: path,
      replacedImagePath: item.imagePath,
      ...sizes,
    });
    return {
      itemId,
      image: publicImageUrls(this.config, path) as ImageUrls,
      sizes,
      oldFilesRemoved,
    };
  }

  async remove(actor: Actor, itemId: string, correlationId: string): Promise<void> {
    const item = await this.findItem(itemId);
    if (!item.imagePath) {
      throw new NotFoundException({
        code: 'IMAGE_NOT_FOUND',
        message: 'This dish has no photo to remove.',
      });
    }
    // Clear the key first: a dish must never point at files that are gone.
    await this.repo.setImagePath(itemId, null);
    const filesRemoved = await this.removeFiles(item.imagePath);
    await this.record(actor, 'menu_item.image_removed', correlationId, {
      itemId,
      imagePath: item.imagePath,
      filesRemoved,
    });
  }

  async usage(): Promise<StorageUsage> {
    const usedBytes = await this.storage.usedBytes();
    const allowanceBytes = this.config.IMAGE_STORAGE_ALLOWANCE_MB * 1024 * 1024;
    const percent = Math.round((usedBytes / allowanceBytes) * 1000) / 10;
    return { usedBytes, allowanceBytes, percent, nearLimit: percent >= NEAR_LIMIT_PERCENT };
  }

  private async findItem(itemId: string): Promise<MenuItemImage> {
    const item = await this.repo.findImage(itemId);
    if (!item) {
      throw new NotFoundException({
        code: 'MENU_ITEM_NOT_FOUND',
        message: 'We could not find that menu item.',
      });
    }
    return item;
  }

  /** Deletes a photo's files; false (and an error log) if storage refused. */
  private async removeFiles(path: string | null): Promise<boolean> {
    if (!path) return true;
    try {
      await this.storage.remove(filesOf(path));
      return true;
    } catch (err) {
      this.logger.error(`Could not remove old photo files at ${path}: ${String(err)}`);
      return false;
    }
  }

  /** Best-effort clean-up after a failed upload; the original error is what the caller sees. */
  private async discard(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.storage.remove(keys);
    } catch (err) {
      this.logger.error(`Could not remove unused photo files ${keys.join(', ')}: ${String(err)}`);
    }
  }

  private async record(
    actor: Actor,
    event: string,
    correlationId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.recordAudit({
        event,
        outcome: 'SUCCESS',
        userId: actor.id,
        correlationId,
        details,
      });
    } catch (err) {
      // The change is saved; a missing audit row must not turn it into an error for staff.
      this.logger.error(`Failed to record ${event} audit: ${String(err)}`);
    }
  }
}

/** The contents decide the type; a name or declared type that disagrees is refused. */
function checkType(file: UploadedFile): void {
  const type = detectImageType(file.buffer);
  if (!type) {
    throw new UnsupportedMediaTypeException({
      code: 'UNSUPPORTED_IMAGE_TYPE',
      message: 'Photos must be JPEG, PNG or WebP.',
    });
  }
  const extension = /\.([a-z0-9]+)$/i.exec(file.originalname)?.[1]?.toLowerCase();
  const declared = file.mimetype.toLowerCase();
  const nameMatches = extension === undefined || EXTENSIONS[type].includes(extension);
  const typeMatches = GENERIC_TYPES.has(declared) || declared === MIME[type];
  if (!nameMatches || !typeMatches) {
    throw new UnsupportedMediaTypeException({
      code: 'IMAGE_TYPE_MISMATCH',
      message: 'That file’s contents don’t match its type. Save it again as JPEG, PNG or WebP.',
    });
  }
}
