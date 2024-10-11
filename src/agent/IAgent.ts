import { Storage } from '../storage/Storage';
import { Protocol } from '../message/Protocol';
import { Message } from '../message/Message'

export interface IAgent {
  getName(): string;
  getAddress(): string;
  getProtocols(): Protocol[];
  getStorage(): Storage;
  sendMessage(): Message;
}