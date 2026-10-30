
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Estados posibles de una empresa dentro de Whatsaap Boot.
 */
export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity('tenants')
export class Tenant {

  // Identificador único de la empresa.
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Nombre comercial de la empresa.
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  // Identificador único para URLs y referencias internas.
  // Ejemplo: tienda-cristian.
  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  // Permite activar o suspender una empresa.
  @Column({
    type: 'varchar',
    length: 20,
    default: TenantStatus.ACTIVE,
  })
  status!: TenantStatus;

  // Fecha en la que se creó la empresa.
  @CreateDateColumn()
  createdAt!: Date;

  // Fecha de la última modificación.
  @UpdateDateColumn()
  updatedAt!: Date;
}
