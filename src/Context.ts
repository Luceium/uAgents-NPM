export type Context = "tmp";
// import { IAgent } from "../agent/IAgent";
// import { Storage } from "../storage/Storage";
// import { Wallet } from "../blockchain/Wallet";
// import { LedgerClient } from "../blockchain/LedgerClient";
// import { Logger } from "../utils/Logger";
// import { Protocol } from "../message/Protocol";
// import { Message } from "../message/Message";

// export class Context {
//   private agent: IAgent;
//   public storage: Storage;
//   public wallet: Wallet;
//   public ledger: LedgerClient;
//   public logger: Logger;

//   constructor(agent: IAgent) {
//     this.agent = agent;
//     this.storage = agent.getStorage();
//     this.wallet = new Wallet();
//     this.ledger = new LedgerClient();
//     this.logger = new Logger(agent.getName());
//   }

//   get name(): string {
//     return this.agent.getName();
//   }

//   get address(): string {
//     return this.agent.getAddress();
//   }

//   get protocols(): Protocol[] {
//     return this.agent.getProtocols();
//   }

//   logInfo(message: string): void {
//     this.logger.info(message);
//   }

//   logError(message: string): void {
//     this.logger.error(message);
//   }

//   async send(message: Message): Promise<void> {
//     await this.agent.sendMessage(message);
//   }

//   async handleMessage(protocol: Protocol, message: Message): Promise<void> {
//     await protocol.handleMessage(this, message);
//   }
// }
