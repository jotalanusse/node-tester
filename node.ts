import { Klyra } from '@klyra/core';

export class Node {
  readonly ip: string;
  readonly klyraClient: Klyra;

  constructor(ip: string, klyraClient: Klyra) {
    this.ip = ip;
    this.klyraClient = klyraClient;
  }
}
