import path from "node:path";

/** Local disk root. On Railway, point this at the persistent volume mount. */
export function dataRoot(): string {
  const configured = process.env.DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}
