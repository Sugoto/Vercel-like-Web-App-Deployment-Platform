import Redis from "ioredis";
import { config } from "../config";

interface WsLike {
  data: { channel?: string };
  send(data: string): void;
}

let publisher: Redis;
let subscriber: Redis;

const channels = new Map<string, Set<WsLike>>();

export function subscribeSocket(ws: WsLike, channel: string) {
  ws.data.channel = channel;
  if (!channels.has(channel)) {
    channels.set(channel, new Set());
  }
  channels.get(channel)!.add(ws);
  ws.send(JSON.stringify({ log: `Joined ${channel}` }));
}

export function unsubscribeSocket(ws: WsLike) {
  if (ws.data.channel) {
    channels.get(ws.data.channel)?.delete(ws);
  }
}

function broadcastToChannel(channel: string, message: string) {
  const sockets = channels.get(channel);
  if (!sockets) return;
  for (const ws of sockets) {
    ws.send(message);
  }
}

export function initRedis() {
  publisher = new Redis(config.REDIS_URL);
  subscriber = new Redis(config.REDIS_URL);

  publisher.on("error", (err) => console.error("Redis publisher error:", err.message));
  subscriber.on("error", (err) => console.error("Redis subscriber error:", err.message));

  subscriber.psubscribe("logs:*");
  subscriber.on("pmessage", (_pattern, channel, message) => {
    broadcastToChannel(channel, message);
  });

  console.log("Redis pub/sub initialized");
}

export function disconnectRedis() {
  publisher?.disconnect();
  subscriber?.disconnect();
}

export function publishLog(projectSlug: string, log: string) {
  const channel = `logs:${projectSlug}`;
  publisher.publish(channel, JSON.stringify({ log }));
}

export async function getRedisStatus(): Promise<"connected" | "disconnected"> {
  try {
    await publisher.ping();
    return "connected";
  } catch {
    return "disconnected";
  }
}
