import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { Tenant } from './tenant.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Roles que puede tener un usuario dentro de una empresa.
 */
export enum TenantRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  AGENT = 'agent',
}

@Entity('tenant_users')
@Index(['tenantId', 'userId'], { unique: true })
export class TenantUser {

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Empresa a la que pertenece el usuario.
  @Column({ type: 'uuid' })
  tenantId!: string;

  // Usuario que pertenece a la empresa.
  @Column({ type: 'uuid' })
  userId!: string;

  // Permisos del usuario dentro de esa empresa.
  @Column({
    type: 'varchar',
    length: 20,
    default: TenantRole.AGENT,
  })
  role!: TenantRole;

  @CreateDateColumn()
  createdAt!: Date;

  // Relación con Tenant.
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant!: Tenant;

  // Relación con User.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}