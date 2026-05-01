import type { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";
import { app } from "../../server/index.js";

const expressHandler = serverless(app);
const functionPrefix = "/.netlify/functions/api";

function normalizePath(path = "/") {
  if (path === functionPrefix) return "/api/health";
  if (path.startsWith(`${functionPrefix}/`)) {
    return `/api/${path.slice(functionPrefix.length + 1)}`;
  }
  return path;
}

function normalizeEvent(event: HandlerEvent): HandlerEvent {
  return { ...event, path: normalizePath(event.path) };
}

export const handler: Handler = (event, context) =>
  expressHandler(normalizeEvent(event), context) as Promise<HandlerResponse>;
