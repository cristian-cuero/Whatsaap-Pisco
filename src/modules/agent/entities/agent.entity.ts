import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { jsonColumnType } from '../../../common/utils/column-types';
import { Session } from '../../session/entities/session.entity';

@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // varchar to match the canonical sessions.id column type.\n  @Column({ type: 'varchar', unique: true })
  sessionId!: string;

  @OneToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: Session;

  @Column({ type: 'varchar', length: 100, default: 'Asistente IA' })
  name!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'openrouter' })
  provider!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  model!: string | null;

  @Column({ type: 'text', nullable: true })
  systemPrompt!: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  config!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
