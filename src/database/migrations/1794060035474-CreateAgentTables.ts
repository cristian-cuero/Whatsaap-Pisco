import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentTables1794060035474 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tabla principal de agentes.
    await queryRunner.query(`
      CREATE TABLE "agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sessionId" VARCHAR(36) NOT NULL,
        "name" character varying(100) NOT NULL DEFAULT 'Asistente IA',
        "enabled" boolean NOT NULL DEFAULT false,
        "provider" character varying(50) NOT NULL DEFAULT 'openrouter',
        "model" character varying(150),
        "systemPrompt" text,
        "config" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agents_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_agents_sessionId" UNIQUE ("sessionId"),
        CONSTRAINT "FK_agents_sessionId"
          FOREIGN KEY ("sessionId")
          REFERENCES "sessions"("id")
          ON DELETE CASCADE
      )
    `);

    // 2. Tabla de historial y consumo de peticiones.
    await queryRunner.query(`
      CREATE TABLE "agent_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "agentId" uuid NOT NULL,
        "provider" character varying(50) NOT NULL,
        "model" character varying(150),
        "status" character varying(30) NOT NULL DEFAULT 'pending',
        "inputTokens" integer NOT NULL DEFAULT 0,
        "outputTokens" integer NOT NULL DEFAULT 0,
        "totalTokens" integer NOT NULL DEFAULT 0,
        "durationMs" integer,
        "error" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agent_requests_agentId"
          FOREIGN KEY ("agentId")
          REFERENCES "agents"("id")
          ON DELETE CASCADE
      )
    `);

    // 3. Índice para consultar rápidamente las peticiones de un agente.
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_requests_agentId"
      ON "agent_requests" ("agentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se elimina primero la tabla dependiente.
    await queryRunner.query(`DROP TABLE "agent_requests"`);

    // Después se elimina la tabla principal.
    await queryRunner.query(`DROP TABLE "agents"`);
  }
}
