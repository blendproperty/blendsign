// Plain-JS Prisma client for the worker process. The Next.js app has its
// own TS client at src/lib/prisma.ts — duplicated here because the worker
// runs as a standalone `node worker/index.js` process outside the Next.js
// build/alias pipeline. Consolidate into a shared workspace package once
// this scaffold graduates past MVP.
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

module.exports = { prisma };
