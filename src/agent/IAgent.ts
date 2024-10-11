import { Storage } from '../storage/Storage';
import { Protocol } from '../message/Protocol';
import { Message } from '../message/Message';
import { Context } from '../context/Context';

export interface IAgent {
  getName(): string;
  getAddress(): string;
  getProtocols(): Protocol[];
  getStorage(): Storage;
  getContext(): Context;

  addProtocol(protocol: Protocol): void;
  removeProtocol(protocolName: string): void;

  handleMessage(message: Message): Promise<void>;
  sendMessage(message: Message): Promise<void>;

  onInterval(period: number, task: (ctx: Context) => Promise<void>): void;
  onMessage(protocolName: string, messageType: string, handler: (ctx: Context, msg: Message) => Promise<void>): void;

  on(event: string, callback: (data: any) => void): void;
  emit(event: string, data: any): void;

  start(): Promise<void>;
  stop(): Promise<void>;
}