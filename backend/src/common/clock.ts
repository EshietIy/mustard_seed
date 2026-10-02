/** Current time, injectable so tests can control "now" (opening hours, cut-off). */
export type Clock = () => Date;
export const CLOCK = Symbol('CLOCK');
export const systemClock: Clock = () => new Date();
