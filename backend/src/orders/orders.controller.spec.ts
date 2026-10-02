import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';

const user = { id: 'u-1', role: 'customer' } as AuthenticatedUser;
const order = {
  id: 'o-1',
  orderNumber: '#MS-0001',
  totalKobo: 1050000,
  fulfilment: 'delivery',
  status: 'awaiting_payment',
};

function deps(created = true) {
  const service = {
    quote: jest.fn().mockResolvedValue({ totalKobo: 1 }),
    place: jest.fn().mockResolvedValue({ order, created }),
    getForUser: jest.fn().mockResolvedValue(order),
  } as unknown as OrdersService;
  const log = { info: jest.fn() };
  const req = { id: 'corr-1', log, user } as unknown as Request;
  const res = { status: jest.fn() } as unknown as Response;
  return { controller: new OrdersController(service), service, log, req, res };
}

describe('OrdersController', () => {
  it('quotes', async () => {
    const { controller } = deps();
    await expect(
      controller.quote({ fulfilment: 'pickup', branchId: 'calabar', items: [] }),
    ).resolves.toEqual({ totalKobo: 1 });
  });

  it('places an order (201) and logs the transaction', async () => {
    const { controller, service, log, req, res } = deps();
    const body = { clientRequestId: 'r' } as never;
    await expect(controller.place(body, req, res)).resolves.toBe(order);
    expect(service.place).toHaveBeenCalledWith(user, body, 'corr-1');
    expect(res.status).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'order.created',
        outcome: 'SUCCESS',
        orderId: 'o-1',
        orderNumber: '#MS-0001',
        userId: 'u-1',
        amountKobo: 1050000,
        statusTransition: 'none -> awaiting_payment',
      }),
      expect.any(String),
    );
  });

  it('answers 200 for an idempotent replay', async () => {
    const { controller, log, req, res } = deps(false);
    await controller.place({} as never, req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'order.replayed' }),
      expect.any(String),
    );
  });

  it('gets an order for its owner', async () => {
    const { controller, service, req } = deps();
    await controller.get('o-1', req);
    expect(service.getForUser).toHaveBeenCalledWith(user, 'o-1');
  });
});
