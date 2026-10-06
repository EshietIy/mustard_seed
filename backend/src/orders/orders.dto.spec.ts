import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CartLineInputDto } from '../cart/cart.dto';
import { OrderItemInputDto } from './orders.dto';

const ITEM = '00000000-0000-4000-8000-000000000001';

describe('option ids on incoming lines', () => {
  it.each([
    ['an order or quote line', OrderItemInputDto],
    ['a cart line', CartLineInputDto],
  ])('%s treats null as no options', async (_label, Dto) => {
    const line = plainToInstance(Dto, { menuItemId: ITEM, quantity: 1, optionIds: null });
    expect(line.optionIds).toEqual([]);
    expect(await validate(line)).toEqual([]);
  });

  it('keeps chosen options and still checks them', async () => {
    const line = plainToInstance(OrderItemInputDto, {
      menuItemId: ITEM,
      quantity: 1,
      optionIds: ['not-a-uuid'],
    });
    expect(line.optionIds).toEqual(['not-a-uuid']);
    expect((await validate(line)).map((e) => e.property)).toEqual(['optionIds']);
  });
});
