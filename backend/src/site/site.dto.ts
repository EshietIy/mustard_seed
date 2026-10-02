import { ApiProperty } from '@nestjs/swagger';

export class HoursDto {
  @ApiProperty({ example: '08:00' })
  opensAt!: string;

  @ApiProperty({ example: '23:00' })
  closesAt!: string;

  @ApiProperty({ example: '22:30', description: 'Online orders close at this time' })
  onlineOrdersCloseAt!: string;

  @ApiProperty({ example: 'Africa/Lagos' })
  timezone!: string;
}

export class DeliveryDto {
  @ApiProperty({ example: 150000, description: 'Flat delivery fee in kobo' })
  feeKobo!: number;

  @ApiProperty({ example: 'Calabar' })
  area!: string;
}

export class BranchDto {
  @ApiProperty({ example: 'calabar' })
  id!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty({ enum: ['headquarters', 'branch'] })
  role!: 'headquarters' | 'branch';

  @ApiProperty({ type: String, nullable: true, description: 'null until supplied (placeholder)' })
  streetAddress!: string | null;

  @ApiProperty()
  onlineOrderingEnabled!: boolean;
}

export class SiteInfoDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true, description: 'null until supplied (placeholder)' })
  phoneWhatsapp!: string | null;

  @ApiProperty({ type: HoursDto })
  hours!: HoursDto;

  @ApiProperty({ type: DeliveryDto })
  delivery!: DeliveryDto;

  @ApiProperty({ type: [BranchDto] })
  branches!: BranchDto[];
}
