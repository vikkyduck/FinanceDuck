import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

registerRoutes(app);

export { app };
