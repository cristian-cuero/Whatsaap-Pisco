import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum TenantUserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  OPERATOR = 'operator',
}

@Entity('tenant_users')
@Index('UQ_tenant_users_tenant_user', ['tenantId', 'userId'], { unique: true })
export class TenantUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  tenantId!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 20, default: TenantUserRole.OPERATOR })
  role!: TenantUserRole;

  @CreateDateColumn()
  createdAt!: Date;
}
