import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";

const app = express();

app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());

registerRoutes(app);

export { app };
