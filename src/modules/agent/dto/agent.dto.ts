import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAgentConfigurationDto {
  @ApiPropertyOptional({ example: 'Ruby IA', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'Eres Ruby, una asistente virtual...', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  systemPrompt?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    example: {
      autoReply: { enabled: true },
      behavior: { language: 'es', tone: 'amigable' },
      menu: { enabled: true },
    },
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateAgentMenuOptionDto {
  @ApiPropertyOptional({ example: 'Consultar contrato', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  number?: number;
}
