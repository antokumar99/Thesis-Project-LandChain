import express from "express";
import cors from "cors";
import { corsOptions } from "./config/cors";
import { authRoutes } from "./routes/auth.routes";
import { landRoutes } from "./routes/land.routes";
import { proofRoutes } from "./routes/proof.routes";
import { challengeRoutes } from "./routes/challenge.routes";
import { transferRoutes } from "./routes/transfer.routes";
import { ipfsRoutes } from "./routes/ipfs.routes";
import { transactionRoutes } from "./routes/transaction.routes";
import { errorMiddleware } from "./middlewares/error.middleware";
import { getDbStatus } from "./config/db";

export const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ success: true, service: "landchain-api", db: getDbStatus() }));
app.use("/api/auth", authRoutes);
app.use("/api/lands", landRoutes);
app.use("/api/proofs", proofRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/ipfs", ipfsRoutes);
app.use("/api/transactions", transactionRoutes);
app.use(errorMiddleware);
