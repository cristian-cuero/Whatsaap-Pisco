
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
  TableColumn,
  TableUnique,
} from "typeorm";

export class CreateMultiTenantCore1793388605047
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {

    // =====================================================
    // 1. TABLA: tenants
    // =====================================================

    await queryRunner.createTable(
      new Table({
        name: "tenants",
        columns: [
          {
            name: "id",
            type: "varchar",
            length: "100",
            isPrimary: true,
            default: "gen_random_uuid()",
          },
          {
            name: "name",
            type: "varchar",
            length: "150",
          },
          {
            name: "slug",
            type: "varchar",
            length: "100",
          },
          {
            name: "status",
            type: "varchar",
            length: "20",
            default: "'active'",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "now()",
          },
        ],
        uniques: [
          new TableUnique({
            columnNames: ["slug"],
          }),
        ],
      }),
      true,
    );

    // =====================================================
    // 2. TABLA: users
    // =====================================================

    await queryRunner.createTable(
      new Table({
        name: "users",
        columns: [
          {
            name: "id",
            type: "varchar",
            length: "100",
            isPrimary: true,
            default: "gen_random_uuid()",
          },
          {
            name: "name",
            type: "varchar",
            length: "150",
          },
          {
            name: "email",
            type: "varchar",
            length: "180",
          },
          {
            name: "passwordHash",
            type: "varchar",
            length: "255",
          },
          {
            name: "isActive",
            type: "boolean",
            default: true,
          },
          {
            name: "lastLoginAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "now()",
          },
        ],
        uniques: [
          new TableUnique({
            columnNames: ["email"],
          }),
        ],
      }),
      true,
    );

    // =====================================================
    // 3. TABLA: tenant_users
    // =====================================================

    await queryRunner.createTable(
      new Table({
        name: "tenant_users",
        columns: [
          {
            name: "id",
            type: "varchar",
            length: "100",
            isPrimary: true,
            default: "gen_random_uuid()",
          },
          {
            name: "tenantId",
            type: "varchar",
            length: "100",
          },
          {
            name: "userId",
            type: "varchar",
            length: "100",
          },
          {
            name: "role",
            type: "varchar",
            length: "20",
            default: "'agent'",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "now()",
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ["tenantId"],
            referencedTableName: "tenants",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          }),
          new TableForeignKey({
            columnNames: ["userId"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          }),
        ],
        indices: [
          new TableIndex({
            columnNames: ["tenantId", "userId"],
            isUnique: true,
          }),
        ],
      }),
      true,
    );

    // =====================================================
    // 4. EMPRESA INICIAL
    // =====================================================

    await queryRunner.query(`
      INSERT INTO "tenants" ("name", "slug", "status")
      VALUES ('Default', 'default', 'active')
    `);

    // =====================================================
    // 5. AGREGAR tenantId A sessions
    // =====================================================

    await queryRunner.addColumn(
      "sessions",
      new TableColumn({
        name: "tenantId",
        type: "varchar",
        length: "100",
        isNullable: true,
      }),
    );

    // Asignar sesiones existentes a la empresa Default.

    await queryRunner.query(`
      UPDATE "sessions"
      SET "tenantId" = (
        SELECT "id"
        FROM "tenants"
        WHERE "slug" = 'default'
      )
    `);

    // =====================================================
    // 6. RELACIÓN sessions -> tenants
    // =====================================================

    await queryRunner.createForeignKey(
      "sessions",
      new TableForeignKey({
        columnNames: ["tenantId"],
        referencedTableName: "tenants",
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      }),
    );

    // =====================================================
    // 7. UNICIDAD POR EMPRESA
    // =====================================================

    // Eliminar restricción global anterior.

    await queryRunner.query(`
      ALTER TABLE "sessions"
      DROP CONSTRAINT "UQ_ac984ccbd8b01af155e1874e8cb"
    `);

    // Crear unicidad compuesta.

    await queryRunner.createIndex(
      "sessions",
      new TableIndex({
        columnNames: ["tenantId", "name"],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {

    // =====================================================
    // 1. ELIMINAR ÍNDICE COMPUESTO
    // =====================================================

    const sessionsTable = await queryRunner.getTable("sessions");

    const sessionIndex = sessionsTable?.indices.find(
      (index) =>
        index.isUnique &&
        index.columnNames.includes("tenantId") &&
        index.columnNames.includes("name"),
    );

    if (sessionIndex) {
      await queryRunner.dropIndex("sessions", sessionIndex);
    }

    // =====================================================
    // 2. ELIMINAR CLAVE FORÁNEA
    // =====================================================

    const sessionForeignKey = sessionsTable?.foreignKeys.find(
      (fk) => fk.columnNames.includes("tenantId"),
    );

    if (sessionForeignKey) {
      await queryRunner.dropForeignKey("sessions", sessionForeignKey);
    }

    // =====================================================
    // 3. ELIMINAR tenantId
    // =====================================================

    await queryRunner.dropColumn("sessions", "tenantId");

    // =====================================================
    // 4. RESTAURAR UNICIDAD GLOBAL
    // =====================================================

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "UQ_ac984ccbd8b01af155e1874e8cb"
      UNIQUE ("name")
    `);

    // =====================================================
    // 5. ELIMINAR TABLAS NUEVAS
    // =====================================================

    await queryRunner.dropTable("tenant_users");
    await queryRunner.dropTable("users");
    await queryRunner.dropTable("tenants");
  }
}
