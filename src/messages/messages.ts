import { Stats } from '../interfaces/stats.interface';

export enum MessageType {
  Log = 'log',
  Stats = 'stats',
}

export abstract class Message {
  type: MessageType;
}

export class LogMessage extends Message {
  override type: MessageType = MessageType.Log;
  message: string;

  constructor(message: string) {
    super();
    this.message = message;
  }
}

export class StatsMessage extends Message {
  override type: MessageType = MessageType.Stats;
  stats: Stats;

  constructor(stats: Stats) {
    super();
    this.stats = stats;
  }
}

export class MessageWrapper {
  type: string;
  workerId: number;
  message: Message;
}
