import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const SIM_OUTCOMES = ['success', 'failed', 'abandoned', 'ongoing'] as const;

export class ForceOutcomeDto {
  @IsIn(SIM_OUTCOMES)
  status!: (typeof SIM_OUTCOMES)[number];

  /** For success: also deliver the charge.success webhook (default true). */
  @IsOptional()
  @IsBoolean()
  webhook?: boolean;
}

export class SendWebhookDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  times?: number;

  @IsOptional()
  @IsIn(['valid', 'invalid', 'missing'])
  signature?: 'valid' | 'invalid' | 'missing';

  /** Deliver a different amount than the transaction's (signed), to test rejection. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountKobo?: number;
}

export class FailNextDto {
  /** HTTP status to answer with; 0 = only delay. */
  @IsOptional()
  @IsIn([0, 500, 502, 503])
  status?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30_000)
  delayMs?: number;
}
