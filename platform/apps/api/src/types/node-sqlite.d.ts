/**
 * Declaração de tipos para `node:sqlite` (built-in Node 22+).
 * O @types/node não inclui a declaração deste módulo, então a declaramos aqui.
 * Mantém retornos como `any` para preservar o comportamento existente do runtime
 * (o tipo dos resultados era inferido como `any` quando o módulo não era tipado).
 */
declare module 'node:sqlite' {
  export interface StatementSync {
    get(...params: any[]): any;
    all(...params: any[]): any[];
    run(...params: any[]): any;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
