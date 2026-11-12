import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HookManager } from '../../core/hooks';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { MessageService } from '../message/message.service';
import { Agent } from './entities/agent.entity';
import { OpenRouterService, RubyMessage } from './openrouter.service';

interface AgentMenuOption {
  id?: string;
  number?: number;
  label?: string;
  enabled?: boolean;
}

interface AgentRuntimeConfig {
  autoReply?: {
    enabled?: boolean;
    replyToGroups?: boolean;
    ignoreFromMe?: boolean;
  };
  behavior?: {
    language?: string;
    tone?: string;
    maxResponseLength?: number;
  };
  menu?: {
    enabled?: boolean;
    options?: AgentMenuOption[];
  };
}

/**
 * Listener principal de Ruby.
 *
 * Recibe mensajes de WhatsApp, carga la configuración del agente,
 * recupera el historial y consulta a OpenRouter.
 */
@Injectable()
export class AgentMessageListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentMessageListener.name);

  private hookId?: string;

  // Evita procesar simultáneamente mensajes del mismo chat.
  private readonly chatQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly hooks: HookManager,
    private readonly messages: MessageService,
    private readonly openRouter: OpenRouterService,

    @InjectRepository(Agent, 'data')
    private readonly agents: Repository<Agent>,
  ) {}

  onModuleInit(): void {
    this.hookId = this.hooks.register(
      'ruby-agent',
      'message:received',
      async ctx => {
        const message = ctx.data as IncomingMessage;

        await this.enqueueMessage(ctx.sessionId, message);

        return { continue: true, data: ctx.data };
      },
      50,
    );

    this.logger.log('Listener de Ruby registrado correctamente');
  }

  onModuleDestroy(): void {
    if (this.hookId) {
      this.hooks.unregister(this.hookId);
    }
  }

  /**
   * Procesa mensajes de un mismo chat en orden.
   */
  private async enqueueMessage(sessionId: string | undefined, message: IncomingMessage): Promise<void> {
    if (!sessionId || !message?.chatId) return;

    const queueId = `${sessionId}:${message.chatId}`;
    const previous = this.chatQueues.get(queueId) ?? Promise.resolve();

    const current = previous
      .catch(() => undefined)
      .then(() => this.handleIncomingMessage(sessionId, message))
      .catch(error => {
        this.logger.error(
          'No fue posible procesar el mensaje de Ruby',
          error instanceof Error ? error.message : String(error),
        );
      });

    this.chatQueues.set(queueId, current);

    void current.then(() => {
      if (this.chatQueues.get(queueId) === current) {
        this.chatQueues.delete(queueId);
      }
    });

    await current;
  }

  /**
   * Atiende un mensaje individual.
   */
  private async handleIncomingMessage(sessionId: string, message: IncomingMessage): Promise<void> {
    // Primera versión: solamente mensajes de texto de chats individuales.
    if (message.fromMe || message.isGroup || message.isStatusBroadcast) return;
    if (message.type !== 'text' || !message.body?.trim()) return;

    // Buscamos el agente asociado a esta sesión.
    const agent = await this.agents.findOne({
      where: { sessionId },
    });

    if (!agent?.enabled) return;

    const config = (agent.config ?? {}) as AgentRuntimeConfig;

    if (config.autoReply?.enabled === false) return;

    if (agent.provider !== 'openrouter') {
      this.logger.warn(`Proveedor no soportado para el agente ${agent.id}`);
      return;
    }

    // Recuperamos el historial reciente del mismo chat.
    const history = await this.messages.getMessages(sessionId, {
      chatId: message.chatId,
      limit: 20,
      inlineMedia: false,
    });

    // getMessages devuelve los mensajes del más reciente al más antiguo.
    const orderedHistory = [...history.messages].reverse();

    const conversation: RubyMessage[] = orderedHistory
      .filter(item => item.type === 'text' && item.body?.trim())
      .map(item => ({
        role: item.direction === 'outgoing' ? 'assistant' : 'user',
        content: item.body,
      }));

    // El evento puede llegar antes de que el mensaje esté persistido.
    // Usamos waMessageId para evitar duplicarlo si ya está en el historial.
    const currentMessageStored = history.messages.some(item => item.waMessageId === message.id);

    if (!currentMessageStored) {
      conversation.push({
        role: 'user',
        content: message.body.trim(),
      });
    }

    // Construimos el contexto a partir de la configuración guardada en BD.
    const systemPrompt = this.buildSystemPrompt(agent, config);

    const messages: RubyMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversation,
    ];

    this.logger.log(`Ruby procesando conversación de sesión ${sessionId}`);

    // Consultamos a OpenRouter.
    const response = await this.openRouter.chat(agent.model, messages);

    const assistantMessage = response.choices[0]?.message;
    const answer = assistantMessage?.content;

    // En esta etapa todavía no procesamos tool calls.
    if (typeof answer !== 'string' || !answer.trim()) {
      this.logger.warn('OpenRouter no devolvió una respuesta de texto');
      return;
    }

    // Enviamos la respuesta por WhatsApp.
    await this.messages.sendText(sessionId, {
      chatId: message.chatId,
      text: answer.trim(),
    });

    this.logger.log('Ruby respondió correctamente');
  }

  /**
   * Construye las instrucciones que recibirá la IA.
   * El prompt principal siempre viene de la base de datos.
   */
  private buildSystemPrompt(agent: Agent, config: AgentRuntimeConfig): string {
    const basePrompt = agent.systemPrompt?.trim() || 'Eres Ruby, una asistente virtual amable y profesional.';

    const behavior = config.behavior ?? {};

    const context: string[] = [
      '',
      'CONFIGURACIÓN ACTUAL DEL AGENTE:',
      `Nombre: ${agent.name}`,
      `Idioma: ${behavior.language ?? 'es'}`,
      `Tono: ${behavior.tone ?? 'amigable'}`,
      `Longitud máxima orientativa: ${behavior.maxResponseLength ?? 500} caracteres.`,
    ];

    // El menú es contexto para la IA, no un flujo rígido.
    if (config.menu?.enabled !== false) {
      const options = (config.menu?.options ?? [])
        .filter(option => option.enabled !== false)
        .map(option => `${option.number}. ${option.label}`);

      if (options.length) {
        context.push(
          '',
          'OPCIONES CONFIGURADAS:',
          ...options,
          'Puedes interpretar solicitudes expresadas por número o por nombre.',
          'No inventes opciones que no estén configuradas.',
        );
      }
    }

    context.push(
      '',
      'IMPORTANTE:',
      '- Responde naturalmente al mensaje del cliente.',
      '- Utiliza el historial para mantener el contexto.',
      '- No repitas saludos innecesariamente.',
      '- En esta etapa no tienes herramientas para ejecutar operaciones externas.',
      '- No afirmes que consultaste contratos, realizaste pagos o ejecutaste acciones.',
    );

    return `${basePrompt}\n${context.join('\n')}`;
  }
}
