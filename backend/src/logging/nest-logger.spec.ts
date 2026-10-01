import type { Logger } from 'pino';
import { PinoNestLogger } from './nest-logger';

describe('PinoNestLogger', () => {
  const pino = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  };
  const logger = new PinoNestLogger(pino as unknown as Logger);

  it('maps every Nest level to pino with the context', () => {
    logger.log('a', 'Ctx');
    logger.error('b', 'trace', 'Ctx');
    logger.warn('c', 'Ctx');
    logger.debug('d', 'Ctx');
    logger.verbose('e', 'Ctx');
    logger.fatal('f', 'Ctx');
    expect(pino.info).toHaveBeenCalledWith({ context: 'Ctx' }, 'a');
    expect(pino.error).toHaveBeenCalledWith({ context: 'Ctx', trace: 'trace' }, 'b');
    expect(pino.warn).toHaveBeenCalledWith({ context: 'Ctx' }, 'c');
    expect(pino.debug).toHaveBeenCalledWith({ context: 'Ctx' }, 'd');
    expect(pino.trace).toHaveBeenCalledWith({ context: 'Ctx' }, 'e');
    expect(pino.fatal).toHaveBeenCalledWith({ context: 'Ctx' }, 'f');
  });
});
