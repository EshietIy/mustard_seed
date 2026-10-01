import { ValidationError } from 'class-validator';
import { validationExceptionFactory } from './validation';

describe('validationExceptionFactory', () => {
  it('produces a 400 with field-level details, including nested fields', () => {
    const errors: ValidationError[] = [
      { property: 'email', constraints: { isEmail: 'email must be an email' }, children: [] },
      {
        property: 'address',
        children: [
          {
            property: 'street',
            constraints: { isNotEmpty: 'street should not be empty' },
            children: [],
          },
        ],
      },
    ];
    const ex = validationExceptionFactory(errors);
    expect(ex.getStatus()).toBe(400);
    expect(ex.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: [
        { field: 'email', messages: ['email must be an email'] },
        { field: 'address.street', messages: ['street should not be empty'] },
      ],
    });
  });
});
