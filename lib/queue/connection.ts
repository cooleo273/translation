import { Queue } from "bullmq";
import IORedis from "ioredis";

let sharedConnection: IORedis | null = null;
let appQueue: Queue | null = null;

export function getRedisConnection(): IORedis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!sharedConnection) {
    sharedConnection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return sharedConnection;
}

export function getQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!appQueue) {
    appQueue = new Queue("app-process", { connection: conn });
  }
  return appQueue;
}
