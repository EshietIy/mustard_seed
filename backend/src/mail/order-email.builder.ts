import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { MENU_REPOSITORY, type MenuRepository } from '../menu/menu.repository';
import { formatClock, localTime } from '../orders/hours';
import { formatOrderNumber } from '../orders/order-number';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import { SITE_REPOSITORY, type SiteRepository } from '../site/site.repository';
import { USERS_REPOSITORY, type UsersRepository } from '../users/users.repository';
import type { OrderConfirmationData } from './templates/order-confirmation/order-confirmation.types';

const TZ = 'Africa/Lagos';
/** Shown until the owner supplies the real values (AGENT.md §1). */
const PHONE_PLACEHOLDER = '[PHONE / WHATSAPP]';
const addressPlaceholder = (city: string) => `[${city.toUpperCase()} ADDRESS]`;

const CHANNELS: Record<string, string> = {
  card: 'Card',
  bank: 'Bank',
  bank_transfer: 'Bank transfer',
  ussd: 'USSD',
  qr: 'QR',
  mobile_money: 'Mobile money',
  eft: 'EFT',
};

/** "+2348031234567" → "+234 803 123 4567"; anything else unchanged. */
export function formatPhone(phone: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

const clockWat = (iso: string) => formatClock(localTime(new Date(iso), TZ));
const dateWat = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));

/** Gathers everything the confirmation email shows for a paid order. */
@Injectable()
export class OrderEmailBuilder {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(MENU_REPOSITORY) private readonly menu: MenuRepository,
    @Inject(SITE_REPOSITORY) private readonly site: SiteRepository,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'FRONTEND_BASE_URL'>,
  ) {}

  async build(orderId: string): Promise<{ to: string; data: OrderConfirmationData }> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new Error(`order ${orderId} not found`);
    const [user, menu, info, branches] = await Promise.all([
      this.users.findById(order.userId),
      this.menu.listItems(),
      this.site.getRestaurantInfo(),
      this.site.listBranches(),
    ]);
    if (!user) throw new Error(`customer for order ${orderId} not found`);
    if (!info) throw new Error('restaurant_info row is missing');

    const byId = new Map(menu.map((m) => [m.id, m]));
    const branch = branches.find((b) => b.id === order.branchId);
    const site = this.config.FRONTEND_BASE_URL.replace(/\/+$/, '');
    const paidAt = order.payment?.paidAt ?? order.createdAt;
    const channel = order.payment?.channel ?? 'card';

    return {
      to: user.email,
      data: {
        firstName: user.firstName || order.contactFullName.split(' ')[0] || 'friend',
        orderNumber: formatOrderNumber(order.orderNumber),
        fulfilment: order.fulfilment,
        etaLabel: order.estimatedReadyAt ? clockWat(order.estimatedReadyAt) : 'Soon',
        trackingUrl: `${site}/track/${order.trackingToken}`,
        items: order.items.map((line) => {
          const item = byId.get(line.menuItemId);
          // Chosen options come from the order's snapshot, so menu edits never change them.
          const note =
            line.options.length > 0
              ? line.options.map((o) => o.name).join(' · ')
              : item?.isHouseSignature
                ? 'House signature'
                : item?.isFreshJuice
                  ? 'Fresh, no preservatives'
                  : null;
          return {
            quantity: line.quantity,
            name: line.name,
            note,
            lineTotalKobo: line.lineTotalKobo,
          };
        }),
        subtotalKobo: order.subtotalKobo,
        deliveryFeeKobo: order.deliveryFeeKobo,
        totalKobo: order.totalKobo,
        deliveryArea: info.deliveryArea,
        paymentChannel: CHANNELS[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1),
        paidAt: `${dateWat(paidAt)}, ${clockWat(paidAt)}`,
        customer: { fullName: order.contactFullName, phone: formatPhone(order.contactPhone) },
        deliveryAddress:
          order.fulfilment === 'delivery' && order.deliveryStreetAddress
            ? {
                streetAddress: order.deliveryStreetAddress,
                city: order.deliveryCity ?? info.deliveryArea,
                state: branch?.state ?? 'Cross River State',
              }
            : null,
        pickupAddress:
          order.fulfilment === 'pickup'
            ? {
                name: info.name,
                streetAddress:
                  branch?.streetAddress ?? addressPlaceholder(branch?.city ?? 'Calabar'),
                city: branch?.city ?? 'Calabar',
                state: branch?.state ?? 'Cross River State',
              }
            : null,
        helpPhone: info.phoneWhatsapp ? formatPhone(info.phoneWhatsapp) : PHONE_PLACEHOLDER,
        hoursLabel: `${formatClock(info.opensAt)} – ${formatClock(info.closesAt)}`,
        siteUrl: site,
        siteDomain: new URL(site).host,
        assetBaseUrl: `${site}/email`,
      },
    };
  }
}
