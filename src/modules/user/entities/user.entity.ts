import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Representa a una persona que puede iniciar sesión
 * en el panel de Whatsaap Boot.
 */
@Entity('users')
export class User {

  // Identificador único del usuario.
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Nombre de la persona.
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  // Correo utilizado para iniciar sesión.
  @Column({ type: 'varchar', length: 180, unique: true })
  email!: string;

  // Contraseña cifrada mediante un hash.
  // Nunca almacenaremos la contraseña original.
  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  // Permite bloquear el acceso de un usuario.
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // Última vez que inició sesión.
  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;

  // Fecha de creación.
  @CreateDateColumn()
  createdAt!: Date;

  // Fecha de actualización.
  @UpdateDateColumn()
  updatedAt!: Date;
}