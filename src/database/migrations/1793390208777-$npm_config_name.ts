
import {
  MigrationInterface,
  QueryRunner,
} from "typeorm";

export class FixMultiTenantUuidTypes1793390208777
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Eliminar temporalmente las claves foráneas.
    await queryRunner.query(`
      ALTER TABLE "sessions"
      DROP CONSTRAINT "FK_3c03d45d6b55202b9563107dc68"
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      DROP CONSTRAINT "FK_b60b5094f416190c9b3103cba2a"
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      DROP CONSTRAINT "FK_5c0a747551be06a29ac8196037e"
    `);

    // 2. Convertir las columnas de las tablas nuevas a UUID.
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ALTER COLUMN "id" TYPE uuid USING "id"::uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "id" TYPE uuid USING "id"::uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
      ALTER COLUMN "tenantId" TYPE uuid USING "tenantId"::uuid,
      ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ALTER COLUMN "tenantId" TYPE uuid USING "tenantId"::uuid
    `);

    // 3. Restaurar las claves foráneas.
    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      ADD CONSTRAINT "FK_b60b5094f416190c9b3103cba2a"
      FOREIGN KEY ("tenantId")
      REFERENCES "tenants"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      ADD CONSTRAINT "FK_5c0a747551be06a29ac8196037e"
      FOREIGN KEY ("userId")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "FK_3c03d45d6b55202b9563107dc68"
      FOREIGN KEY ("tenantId")
      REFERENCES "tenants"("id")
      ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar temporalmente las claves foráneas.
    await queryRunner.query(`
      ALTER TABLE "sessions"
      DROP CONSTRAINT "FK_3c03d45d6b55202b9563107dc68"
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      DROP CONSTRAINT "FK_b60b5094f416190c9b3103cba2a"
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      DROP CONSTRAINT "FK_5c0a747551be06a29ac8196037e"
    `);

    // Revertir los tipos a varchar.
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ALTER COLUMN "id" TYPE varchar(100) USING "id"::varchar
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "id" TYPE varchar(100) USING "id"::varchar
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      ALTER COLUMN "id" TYPE varchar(100) USING "id"::varchar,
      ALTER COLUMN "tenantId" TYPE varchar(100) USING "tenantId"::varchar,
      ALTER COLUMN "userId" TYPE varchar(100) USING "userId"::varchar
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ALTER COLUMN "tenantId" TYPE varchar(100) USING "tenantId"::varchar
    `);

    // Restaurar las claves foráneas.
    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      ADD CONSTRAINT "FK_b60b5094f416190c9b3103cba2a"
      FOREIGN KEY ("tenantId")
      REFERENCES "tenants"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_users"
      ADD CONSTRAINT "FK_5c0a747551be06a29ac8196037e"
      FOREIGN KEY ("userId")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "FK_3c03d45d6b55202b9563107dc68"
      FOREIGN KEY ("tenantId")
      REFERENCES "tenants"("id")
      ON DELETE RESTRICT
    `);
  }
}
