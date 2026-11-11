import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Describe los parámetros que necesita una operación.
export interface OperationParameter {
  type: string;
  required: boolean;
  source: string;
}

// Describe una operación del catálogo.
export interface AgentOperation {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  auth: string;
  parameters: Record<string, OperationParameter>;
  query?: Record<string, string>;
}

// Estructura principal del JSON.
interface OperationsCatalog {
  operations: AgentOperation[];
}

@Injectable()
export class AgentOperationsService {
  private readonly operations: AgentOperation[];

  constructor() {
    // El archivo se copia a dist mediante la configuración de Nest.
    const catalogPath = join(__dirname, 'operations.catalog.json');

    try {
      const content = readFileSync(catalogPath, 'utf-8');
      const catalog = JSON.parse(content) as OperationsCatalog;

      if (!Array.isArray(catalog.operations)) {
        throw new Error('La propiedad operations no es un arreglo');
      }

      // Validamos que no existan identificadores duplicados.
      const ids = catalog.operations.map(operation => operation.id);

      if (new Set(ids).size !== ids.length) {
        throw new Error('Hay identificadores duplicados en el catálogo');
      }

      this.operations = catalog.operations;
    } catch (error) {
      throw new InternalServerErrorException(
        `No se pudo cargar el catálogo de operaciones: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
    }
  }

  // Devuelve todas las operaciones del catálogo.
  getAll(): AgentOperation[] {
    return structuredClone(this.operations);
  }

  // Devuelve únicamente las operaciones habilitadas globalmente.
  getAllEnabled(): AgentOperation[] {
    return this.operations.filter(operation => operation.enabled).map(operation => structuredClone(operation));
  }

  // Busca una operación por su identificador.
  getById(id: string): AgentOperation {
    const operation = this.operations.find(item => item.id === id);

    if (!operation) {
      throw new NotFoundException(`No existe la operación "${id}" en el catálogo`);
    }

    return structuredClone(operation);
  }

  // Busca una operación y verifica que esté habilitada globalmente.
  getEnabledById(id: string): AgentOperation {
    const operation = this.getById(id);

    if (!operation.enabled) {
      throw new NotFoundException(`La operación "${id}" está deshabilitada`);
    }

    return operation;
  }
}
