import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Establishes the first SaaS identity boundary:
 * - tenants: customer companies/workspaces
 * - users: human dashboard accounts
 * - tenant_users: a user's membership and role in a company
 * - sessions.tenantId: owner of each existing/new WhatsApp session
 *
 * API keys remain in the separate "main" database and are not changed here.
 */
export class AddSaasTenantFoundation1793400000000 implements MigrationInterface {
  name = 'AddSaasTenantFoundation1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const timestamp = isPostgres ? 'TIMESTAMP' : 'datetime';
    const boolTrue = isPostgres ? 'true' : '1';
    const boolFalse = isPostgres ? 'false' : '0';
    const defaultTenantId = '00000000-0000-4000-8000-000000000001';

    if (!(await queryRunner.hasTable('tenants'))) {
      await queryRunner.query(
        `CREATE TABLE "tenants" (
          "id" varchar PRIMARY KEY NOT NULL,
          "name" varchar(120) NOT NULL,
          "slug" varchar(80) NOT NULL,
          "status" varchar(20) NOT NULL DEFAULT 'active',
          "createdAt" ${timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" ${timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_tenants_slug" ON "tenants" ("slug")`,
      );
    }

    // A reserved initial workspace lets this migration safely adopt a database that already
    // contains sessions. The first owner account will be attached during the account bootstrap flow.
    await queryRunner.query(
      `INSERT INTO "tenants" ("id", "name", "slug", "status", "createdAt", "updatedAt")
       VALUES ('${defaultTenantId}', 'Default workspace', 'default', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO NOTHING`,
    );

    if (!(await queryRunner.hasTable('users'))) {
      await queryRunner.query(
        `CREATE TABLE "users" (
          "id" varchar PRIMARY KEY NOT NULL,
          "name" varchar(120) NOT NULL,
          "email" varchar(190) NOT NULL,
          "passwordHash" varchar(255) NOT NULL,
          "isActive" boolean NOT NULL DEFAULT ${boolTrue},
          "lastLoginAt" ${timestamp},
          "createdAt" ${timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" ${timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      );
      await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`);
    }

    if (!(await queryRunner.hasTable('tenant_users'))) {
      await queryRunner.query(
        `CREATE TABLE "tenant_users" (
          "id" varchar PRIMARY KEY NOT NULL,
          "tenantId" varchar(36) NOT NULL,
          "userId" varchar(36) NOT NULL,
          "role" varchar(20) NOT NULL DEFAULT 'operator',
          "createdAt" ${timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "FK_tenant_users_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE,
          CONSTRAINT "FK_tenant_users_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
        )`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_tenant_users_tenant_user" ON "tenant_users" ("tenantId", "userId")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_tenant_users_user" ON "tenant_users" ("userId")`,
      );
    }

    if (await queryRunner.hasTable('sessions') && !(await queryRunner.hasColumn('sessions', 'tenantId'))) {
      await queryRunner.query(
        `ALTER TABLE "sessions" ADD COLUMN "tenantId" varchar(36) NOT NULL DEFAULT '${defaultTenantId}'`,
      );
    }

    // PostgreSQL can enforce the relationship on the existing sessions table with ALTER TABLE.
    // SQLite keeps the same tenantId ownership column; the application enforces the relationship.
    if (isPostgres && (await queryRunner.hasTable('sessions'))) {
      const constraints = (await queryRunner.query(
        `SELECT 1 FROM information_schema.table_constraints
         WHERE table_schema = current_schema()
           AND table_name = 'sessions'
           AND constraint_name = 'FK_sessions_tenant'`,
      )) as unknown[];
      if (!constraints.length) {
        await queryRunner.query(
          `ALTER TABLE "sessions"
           ADD CONSTRAINT "FK_sessions_tenant"
           FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT`,
        );
      }
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_sessions_tenantId" ON "sessions" ("tenantId")`,
      );
    } else if (await queryRunner.hasTable('sessions')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_sessions_tenantId" ON "sessions" ("tenantId")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';

    if (isPostgres && (await queryRunner.hasTable('sessions'))) {
      const constraints = (await queryRunner.query(
        `SELECT 1 FROM information_schema.table_constraints
         WHERE table_schema = current_schema()
           AND table_name = 'sessions'
           AND constraint_name = 'FK_sessions_tenant'`,
      )) as unknown[];
      if (constraints.length) {
        await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "FK_sessions_tenant"`);
      }
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_tenantId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenant_users_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_tenant_users_tenant_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_tenants_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
    // Deliberately leave sessions.tenantId in place on rollback so no session ownership data is lost.
  }
}
