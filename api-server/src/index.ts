import { createServer } from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { config } from "./config";
import { initRedis, disconnectRedis } from "./services/log.service";
import { errorHandler } from "./middleware/error-handler";
import { apiLimiter } from "./middleware/rate-limit";
import healthRoutes from "./routes/health.routes";
import projectRoutes from "./routes/project.routes";

const logger = pino({ level: "info" });

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("subscribe", (channel: string) => {
    socket.join(channel);
    socket.emit("message", JSON.stringify({ log: `Joined ${channel}` }));
  });
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.CLIENT_URL }));
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));
app.use(apiLimiter);

app.get("/", (_req, res) => {
  res.json({ name: "Verse API", version: "2.0.0" });
});

app.use(healthRoutes);
app.use(projectRoutes);
app.use(errorHandler);

initRedis(io);

const server = httpServer.listen(config.PORT, () => {
  logger.info(`Verse API running on port ${config.PORT}`);
});

function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down...`);
  server.close(() => {
    disconnectRedis();
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
