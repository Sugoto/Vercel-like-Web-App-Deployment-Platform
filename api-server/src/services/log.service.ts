import Redis from "ioredis";
import type { Server as SocketIOServer } from "socket.io";
import { config } from "../config";

let publisher: Redis;
let subscriber: Redis;

export function initRedis(io: SocketIOServer) {
  publisher = new Redis(config.REDIS_URL);
  subscriber = new Redis(config.REDIS_URL);

  publisher.on("error", (err) => console.error("Redis publisher error:", err.message));
  subscriber.on("error", (err) => console.error("Redis subscriber error:", err.message));

  subscriber.psubscribe("logs:*");
  subscriber.on("pmessage", (_pattern, channel, message) => {
    io.to(channel).emit("message", message);
  });

  console.log("Redis pub/sub initialized");
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
