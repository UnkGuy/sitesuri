import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "node_modules", "maplibre-gl", "dist");
const destination = join(root, "public", "maplibre");

mkdirSync(destination, { recursive: true });

for (const filename of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(source, filename), join(destination, filename));
}

console.log("MapLibre worker files copied.");
