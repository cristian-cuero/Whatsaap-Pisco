import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Agent } from './entities/agent.entity';
import { Session } from '../session/entities/session.entity';

const DEFAULT_SYSTEM_PROMPT = `
Eres Ruby IA, una asistente virtual que atiende conversaciones
por WhatsApp.

IDENTIDAD:
- Tu nombre es Ruby.
- Eres amable, profesional, cercana y servicial.
- Te comunicas de forma natural, como una persona.
- Tu idioma principal es el español.

COMPORTAMIENTO:
- Saluda cordialmente cuando corresponda.
- Comprende primero lo que necesita el cliente.
- Responde de manera clara, breve y organizada.
- Evita respuestas demasiado largas.
- Haz preguntas cuando necesites información adicional.
- No repitas saludos en cada mensaje.
- Adapta tu tono al contexto de la conversación.

REGLAS:
- No inventes información.
- No afirmes que realizaste una operación si no se ha confirmado.
- No inventes precios, pagos, contratos ni estados de solicitudes.
- Si no tienes información suficiente, indícalo con honestidad.
- No solicites datos personales innecesarios.
- Utiliza las herramientas disponibles cuando necesites consultar
  información o ejecutar operaciones.

OBJETIVO:
Brindar atención eficiente, resolver las dudas de los clientes
y ayudarlos a completar sus solicitudes.
`;

const DEFAULT_AGENT_CONFIG = {
  autoReply: {
    enabled: false,
    replyToGroups: false,
    ignoreFromMe: true,
    cooldownSeconds: 30,
  },
  behavior: {
    language: 'es',
    tone: 'amigable',
    maxResponseLength: 500,
  },
};

export interface UpdateAgentConfiguration {
  name?: string;
  enabled?: boolean;
  systemPrompt?: string | null;
  config?: Record<string, unknown>;
}

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(Agent, 'data')
    private readonly agentRepository: Repository<Agent>,

    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
  ) {}

  /**
   * Verifica que la sesión pertenezca al tenant.
   */
  private async validateSessionOwnership(sessionId: string, tenantId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        tenantId,
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
  }

  /**
   * Obtiene el agente de una sesión.
   * Si no existe, crea uno con configuración predeterminada.
   */
  async getOrCreateForSession(sessionId: string, tenantId: string): Promise<Agent> {
    await this.validateSessionOwnership(sessionId, tenantId);

    const existingAgent = await this.agentRepository.findOne({
      where: { sessionId },
    });

    if (existingAgent) {
      return existingAgent;
    }

    const agent = this.agentRepository.create({
      sessionId,
      name: 'Ruby IA',
      enabled: true,
      provider: 'openrouter',
      model: null,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      config: DEFAULT_AGENT_CONFIG,
    });

    return this.agentRepository.save(agent);
  }

  /**
   * Consulta la configuración del agente.
   */
  async getConfiguration(sessionId: string, tenantId: string): Promise<Agent> {
    return this.getOrCreateForSession(sessionId, tenantId);
  }

  /**
   * Actualiza la configuración del agente.
   */
  async updateConfiguration(sessionId: string, tenantId: string, changes: UpdateAgentConfiguration): Promise<Agent> {
    const agent = await this.getOrCreateForSession(sessionId, tenantId);

    if (changes.name !== undefined) {
      agent.name = changes.name;
    }

    if (changes.enabled !== undefined) {
      agent.enabled = changes.enabled;
    }

    if (changes.systemPrompt !== undefined) {
      agent.systemPrompt = changes.systemPrompt;
    }

    if (changes.config !== undefined) {
      agent.config = {
        ...(agent.config ?? {}),
        ...changes.config,
      };
    }

    return this.agentRepository.save(agent);
  }
}
