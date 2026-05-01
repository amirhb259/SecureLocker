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

export const handler = (event: any, context: any) =>
  expressHandler({ ...event, path: normalizePath(event.path) }, context);
