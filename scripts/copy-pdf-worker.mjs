import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const source = join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destination = join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
