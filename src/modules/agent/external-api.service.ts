/* eslint-disable prettier/prettier */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface ExternalOperation {
  method: 'GET' | 'POST';
  path: string;
  auth?: 'pisco';
  query?: Record<string, string>;
}

@Injectable()
export class ExternalApiService {
  // eslint-disable-next-line no-restricted-syntax
  private readonly logger = new Logger(ExternalApiService.name);

  // Token temporal de Pisco. No se guarda en la base de datos.
  private piscoToken: string | null = null;
  private tokenExpiresAt = 0;

  private getPiscoBaseUrl(): string {
    const baseUrl = process.env.PISCO_API_BASE_URL;

    if (!baseUrl) {
      throw new ServiceUnavailableException('No está configurada la conexión con Pisco');
    }

    return baseUrl.replace(/\/+$/, '');
  }

  /**
   * Ejecuta una operación HTTP configurada para el agente.
   * La URL base siempre viene del servidor, nunca del modelo de IA.
   */
  async execute(
    operation: ExternalOperation,
    params: Record<string, string>,
    body?: Record<string, string | number>,
  ): Promise<unknown> {
    if (!['GET', 'POST'].includes(operation.method)) {
      throw new Error('Método HTTP no permitido');
    }

    // Solo permitimos rutas relativas de la API.
    if (!operation.path.startsWith('/api/') || operation.path.includes('..') || operation.path.includes('://')) {
      throw new Error('Ruta de operación no permitida');
    }

    const url = new URL(`${this.getPiscoBaseUrl()}${operation.path}`);

    // Los parámetros se obtienen de los datos recibidos del cliente.
    for (const [key, template] of Object.entries(operation.query ?? {})) {
      const match = template.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);

      if (!match) {
        throw new Error(`Parámetro no válido: ${key}`);
      }

      const value = params[match[1]];

      if (!value) {
        throw new Error(`Falta el parámetro: ${match[1]}`);
      }

      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (operation.auth === 'pisco') {
      headers['x-token'] = await this.getPiscoToken();
    }

    if (body && operation.method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const requestOptions: RequestInit = {
      method: operation.method,
      headers,
      ...(body && operation.method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    };

    const response = await fetch(url, requestOptions);

    // Si el token expiró, renovamos y repetimos una sola vez.
    if (response.status === 401 && operation.auth === 'pisco') {
      this.piscoToken = null;
      this.tokenExpiresAt = 0;

      headers['x-token'] = await this.getPiscoToken();

      const retry = await fetch(url, {
        ...requestOptions,
        headers,
      });

      if (!retry.ok) {
        throw new Error(`Pisco respondió con HTTP ${retry.status}`);
      }

      return retry.json();
    }

    if (!response.ok) {
      this.logger.error(`Error HTTP de Pisco: ${response.status}`);
      throw new Error(`La operación falló con HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Obtiene y almacena temporalmente el token de autenticación.
   */
  private async getPiscoToken(): Promise<string> {
    if (this.piscoToken && Date.now() < this.tokenExpiresAt) {
      return this.piscoToken;
    }

    const username = process.env.PISCO_API_USERNAME;
    const password = process.env.PISCO_API_PASSWORD;

    if (!username || !password) {
      throw new ServiceUnavailableException('Faltan las credenciales de Pisco en el servidor');
    }

    const response = await fetch(`${this.getPiscoBaseUrl()}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      this.logger.error(`Falló el login de Pisco: HTTP ${response.status}`);
      throw new Error('No fue posible autenticar con Pisco');
    }

    const data = (await response.json()) as { token?: string };

    if (!data.token) {
      throw new Error('Pisco no entregó un token válido');
    }

    this.piscoToken = data.token;

    // Renovación preventiva. No dependemos de decodificar el JWT.
    this.tokenExpiresAt = Date.now() + 10 * 60 * 1000;

    return this.piscoToken;
  }
}
