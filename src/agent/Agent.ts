export const Agent = "tmp";
// import { IAgent } from "./IAgent";
// import { Context } from "../context/Context";
// import { Storage } from "../storage/Storage";
// import { Protocol } from "../message/Protocol";
// import { Message } from "../message/Message";
// import { EventEmitter } from "../events/EventEmitter";
// import { TaskScheduler } from "../scheduler/TaskScheduler";
// import { NetworkManager } from "../network/NetworkManager";
// import { generateAddress } from "../utils/AddressGenerator";

// export class Agent implements IAgent {
// private name: string;
// private address: string;
// private protocols: Map<string, Protocol>;
// private storage: Storage;
// private context: Context;
// private eventEmitter: EventEmitter;
// private taskScheduler: TaskScheduler;
// private networkManager: NetworkManager;

// constructor(name: string, storage: Storage) {
//   this.name = name;
//   this.address = generateAddress();
//   this.protocols = new Map();
//   this.storage = storage;
//   this.context = new Context(this);
//   this.eventEmitter = new EventEmitter();
//   this.taskScheduler = new TaskScheduler();
//   this.networkManager = NetworkManager.getInstance();

//   this.setupNetworkListeners();
// }

// getName(): string {
//   return this.name;
// }

// getAddress(): string {
//   return this.address;
// }

// getProtocols(): Protocol[] {
//   return Array.from(this.protocols.values());
// }

// getStorage(): Storage {
//   return this.storage;
// }

// getContext(): Context {
//   return this.context;
// }

// addProtocol(protocol: Protocol): void {
//   this.protocols.set(protocol.getName(), protocol);
// }

// removeProtocol(protocolName: string): void {
//   this.protocols.delete(protocolName);
// }

// async handleMessage(message: Message): Promise<void> {
//   const protocol = this.protocols.get(message.protocol);
//   if (protocol) {
//     await protocol.handleMessage(this.context, message);
//   } else {
//     this.context.logError(`No protocol found for message: ${message.protocol}`);
//   }
// }

// async sendMessage(message: Message): Promise<void> {
//   await this.networkManager.sendMessage(message);
// }

// onInterval(period: number, task: (ctx: Context) => Promise<void>): void {
//   this.taskScheduler.scheduleTask(
//     `${this.name}_${Date.now()}`,
//     async () => {
//       await task(this.context);
//     },
//     period
//   );
// }

// onMessage(protocolName: string, messageType: string, handler: (ctx: Context, msg: Message) => Promise<void>): void {
//   const protocol = this.protocols.get(protocolName);
//   if (protocol) {
//     protocol.addHandler(messageType, handler);
//   } else {
//     this.context.logError(`Protocol not found: ${protocolName}`);
//   }
// }

// private setupNetworkListeners(): void {
//   this.networkManager.onMessage(async (message: Message) => {
//     if (message.recipient === this.address) {
//       await this.handleMessage(message);
//     }
//   });
// }

// on(event: string, callback: (data: any) => void): void {
//   this.eventEmitter.on(event, callback);
// }

// emit(event: string, data: any): void {
//   this.eventEmitter.emit(event, data);
// }

// async start(): Promise<void> {
//   this.context.logInfo(`Agent ${this.name} started`);
// }

// async stop(): Promise<void> {
//   this.taskScheduler.stopAllTasks();
//   this.context.logInfo(`Agent ${this.name} stopped`);
// }
// }
