import type { Response } from "express";

export function sendAuthPage(res: Response, title: string, message: string) {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #04070d; color: #eef9ff; font-family: Inter, system-ui, sans-serif; }
    main { width: min(520px, calc(100vw - 40px)); padding: 32px; border: 1px solid rgba(142, 232, 255, .22); border-radius: 20px; background: rgba(9, 16, 27, .86); box-shadow: 0 28px 86px rgba(0,0,0,.48); }
    h1 { margin: 0 0 12px; font-size: 28px; }
    p { margin: 0; color: #bed0dc; line-height: 1.6; }
  </style>
</head>
<body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`);
}
