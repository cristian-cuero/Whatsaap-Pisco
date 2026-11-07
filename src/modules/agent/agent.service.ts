import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Agent } from './entities/agent.entity';
import { Session } from '../session/entities/session.entity';

const DEFAULT_SYSTEM_PROMPT = `

MENÚ DE ATENCIÓN:

- Utiliza el menú de opciones que recibas desde la configuración
  del agente.
- Muestra únicamente las opciones que estén habilitadas.
- Respeta el número y el nombre de cada opción.
- Cuando el cliente seleccione una opción, identifica la acción
  correspondiente.
- Si el cliente escribe el nombre de una operación en lugar
  de su número, intenta identificarla.
- No ejecutes operaciones que no estén habilitadas.
- No inventes resultados de consultas ni confirmaciones de pagos.
- Si el cliente solicita hablar con un asesor, respeta esa solicitud
  y activa el proceso de transferencia disponible.
- No inventes opciones que no estén configuradas.

`;

const DEFAULT_AGENT_CONFIG = {
  autoReply: {
    enabled: true,
    replyToGroups: false,
    ignoreFromMe: true,
    cooldownSeconds: 30,
  },

  behavior: {
    language: 'es',
    tone: 'amigable',
    maxResponseLength: 500,
  },

  menu: {
    enabled: true,
    showOnFirstMessage: true,
    showAfterInactivity: true,
    inactivityMinutes: 30,

    welcomeMessage: '¡Hola! 👋 Soy Ruby, tu asistente virtual. ¿Qué trámite deseas realizar?',

    options: [
      {
        id: 'consultar_contrato',
        number: 1,
        label: 'Consultar contrato',
        action: 'consultar_contrato',
        enabled: true,
      },
      {
        id: 'pagar_contrato',
        number: 2,
        label: 'Pagar contrato',
        action: 'pagar_contrato',
        enabled: true,
      },
      {
        id: 'consultar_beneficiarios',
        number: 3,
        label: 'Consultar beneficiarios',
        action: 'consultar_beneficiarios',
        enabled: true,
      },
      {
        id: 'hablar_asesor',
        number: 4,
        label: 'Hablar con un asesor',
        action: 'transferir_asesor',
        enabled: true,
      },
    ],
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
