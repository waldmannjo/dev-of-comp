import { build } from "esbuild";
import { banner } from "./banner.js";

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  outfile: "dist/openfront-companion.user.js",
  banner: { js: banner },
  target: "es2022",
});

console.log("Built dist/openfront-companion.user.js");
