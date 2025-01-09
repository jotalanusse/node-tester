export enum MessageType {
  Log = 'log',
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

export class MessageWrapper {
  type: string;
  workerId: number;
  message: Message;
}
