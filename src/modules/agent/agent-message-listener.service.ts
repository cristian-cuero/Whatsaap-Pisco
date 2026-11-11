import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HookManager } from '../../core/hooks';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { MessageService } from '../message/message.service';
import { Agent } from './entities/agent.entity';

interface AgentMenuOption {
  id?: string;
  number?: number;
  label?: string;
  enabled?: boolean;
}

interface AgentRuntimeConfig {
  autoReply?: { enabled?: boolean; replyToGroups?: boolean; ignoreFromMe?: boolean };
  menu?: {
    enabled?: boolean;
    showOnFirstMessage?: boolean;
    welcomeMessage?: string;
    options?: AgentMenuOption[];
  };
}

/**
 * Prueba inicial de Ruby: envía el menú configurado al primer mensaje entrante
 * de cada chat individual. No ejecuta acciones ni consulta OpenRouter.
 */
@Injectable()
export class AgentMessageListener implements OnModuleInit, OnModuleDestroy {
  private hookId?: string;
  private readonly greetedChats = new Set<string>();

  constructor(
    private readonly hooks: HookManager,
    private readonly messages: MessageService,
    @InjectRepository(Agent, 'data')
    private readonly agents: Repository<Agent>,
  ) {}

  onModuleInit(): void {
    this.hookId = this.hooks.register(
      'ruby-agent',
      'message:received',
      async ctx => {
        const message = ctx.data as IncomingMessage;
        await this.handleIncomingMessage(ctx.sessionId, message);
        return { continue: true, data: ctx.data };
      },
      50,
    );
  }

  onModuleDestroy(): void {
    if (this.hookId) this.hooks.unregister(this.hookId);
  }

  private async handleIncomingMessage(sessionId: string | undefined, message: IncomingMessage): Promise<void> {
    if (!sessionId || !message || message.fromMe || message.isGroup || message.isStatusBroadcast) return;
    if (message.type !== 'text' || !message.body?.trim() || !message.chatId) return;

    const agent = await this.agents.findOne({ where: { sessionId } });
    if (!agent?.enabled) return;

    const config = (agent.config ?? {}) as AgentRuntimeConfig;
    if (config.autoReply?.enabled === false || config.menu?.enabled === false) return;
    if (config.autoReply?.ignoreFromMe !== false && message.fromMe) return;
    if (config.menu?.showOnFirstMessage === false) return;

    const greetingKey = `${sessionId}:${message.chatId}`;
    if (this.greetedChats.has(greetingKey)) return;

    const options = (config.menu?.options ?? []).filter(option => option.enabled !== false);
    const welcome = config.menu?.welcomeMessage?.trim() ||
      '¡Hola! Soy Ruby, tu asistente virtual. ¿En qué puedo ayudarte?';
    const menuLines = options.map(option => `${option.number}. ${option.label}`);
    const text = [welcome, ...(menuLines.length ? ['', ...menuLines] : [])].join('\n');

    // Marcar antes del envío para evitar dos menús si llegan mensajes casi simultáneos.
    this.greetedChats.add(greetingKey);
    try {
      await this.messages.sendText(sessionId, { chatId: message.chatId, text });
    } catch (error) {
      this.greetedChats.delete(greetingKey);
      throw error;
    }
  }
}
