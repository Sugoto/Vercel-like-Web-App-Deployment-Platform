import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config";
import { initRedis } from "./services/log.service";
import { errorHandler } from "./middleware/error-handler";
import { apiLimiter } from "./middleware/rate-limit";
import healthRoutes from "./routes/health.routes";
import projectRoutes from "./routes/project.routes";

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

app.use(cors({ origin: config.CLIENT_URL }));
app.use(express.json());
app.use(apiLimiter);

app.get("/", (_req, res) => {
  res.json({ name: "Verse API", version: "2.0.0" });
});

app.use(healthRoutes);
app.use(projectRoutes);
app.use(errorHandler);

initRedis(io);

httpServer.listen(config.PORT, () => {
  console.log(`Verse API running on port ${config.PORT}`);
});
