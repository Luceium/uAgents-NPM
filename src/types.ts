import { Context } from "./Context";
import { Model } from "./model";

export type IntervalCallback = (context: Context) => Promise<void>;
export type MessageCallback = (
  context: Context,
  sender: string,
  recoveredMessage: any
) => Promise<void>;
export type EventCallback = (context: Context) => Promise<void>;
export type WalletMessageCallback = (context: Context, message: any) => Promise<void>;

export type RestReturnType = Model<{ [key: string]: any }>;
export type RestGetHandler = (context: Context) => Promise<RestReturnType | null>;
export type RestPostHandler = (
  context: Context,
  data: any
) => Promise<RestReturnType | null>;
export type RestHandler = RestGetHandler | RestPostHandler;
export type RestMethod = "GET" | "POST";
export type RestHandlerMap = { [key: string]: RestHandler }; // where key is in the format of "GET /path" or "POST /path"

export type AgentEndpoint = { url: string; weight: number };
export type AgentInfo = {
  agent_address: string;
  endpoints: AgentEndpoint[];
  protocols: string[];
};
export type RestHandlerDetails = {
  method: RestMethod;
  endpoint: string;
  request_model?: Model<any>;
  response_model: Model<any>;
};

class AgentGeolocation {
  latitude: number;
  longitude: number;
  radius: number;

  constructor(latitude: number, longitude: number, radius: number = 0) {
    if (latitude < -90 || latitude > 90)
      throw new Error("latitude out of range [-90, 90]");
    this.latitude = AgentGeolocation.confineTo6Digits(latitude);
    if (longitude < -180 || longitude > 180)
      throw new Error("longitude out of range [-180, 180]");
    this.longitude = AgentGeolocation.confineTo6Digits(longitude);
    if (radius < 0) throw new Error("radius must be positive");
    this.radius = radius;
  }

  private static confineTo6Digits(num: number): number {
    return Math.round(num * 1e6) / 1e6;
  }
}

/**
 * Represents the metadata of an agent.
 *
 * Framework specific fields will be added here to ensure valid serialization.
 * Additional fields will simply be passed through.
 * @prop {AgentGeolocation} geolocation The geolocation of the agent.
 */
export type AgentMetadata = {
  geolocation?: AgentGeolocation;
  [key: string]: any;
};

/**
 * Delivery Status of a message
 */
export enum DeliveryStatus {
  SENT = "sent",
  DELIVERED = "delivered",
  FAILED = "failed",
}

/**
 * Represents a message digest containing a message and its schema digest.
 * @prop {any} message The message content.
 * @prop {string} schema_digest The schema digest of the message.
 */
export type MsgDigest = {
  message: any;
  schema_digest: string;
};

/**
 * Represents the status of a sent message.
 * @prop {DeliveryStatus} status The delivery status of the message {'sent', 'delivered', 'failed'}.
 * @prop {string} detail The details of the message delivery.
 * @prop {string} destination The destination address of the message.
 * @prop {string} endpoint The endpoint the message was sent to.
 * @prop {string | null} session The session ID of the message. Should be a valid UUID
 */
export type MsgStatus = {
  status: DeliveryStatus;
  detail: string;
  destination: string;
  endpoint: string;
  session?: string;
};
