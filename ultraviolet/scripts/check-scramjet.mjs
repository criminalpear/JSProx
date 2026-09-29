// Reports which JSProx bundle patches (src/scramjet-compat.js) still apply to a
// published Scramjet release. Usage: npm run check:scramjet [-- <version|tag>]
// Exits 1 when any patch needs review, so CI can flag an upgrade early.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findScramjetPatchProblems } from "../src/scramjet-compat.js";

const spec = "@mercuryworkshop/scramjet@" + (process.argv[2] || "latest");
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8", shell: process.platform === "win32" }).trim();
const installed = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).dependencies[
  "@mercuryworkshop/scramjet"
];
const dir = mkdtempSync(join(tmpdir(), "jsprox-scramjet-"));
try {
  const tarball = run("npm", ["pack", spec, "--silent", "--pack-destination", dir], dir).split(/\r?\n/).pop();
  run("tar", ["-xzf", tarball], dir);
  const { version } = JSON.parse(readFileSync(join(dir, "package", "package.json"), "utf8"));
  console.log(`Scramjet ${version} (JSProx pins ${installed})`);
  const bundle = join(dir, "package", "dist", "scramjet.all.js");
  if (!existsSync(bundle)) {
    console.log("dist/scramjet.all.js is missing: the package layout changed. src/index.js and the");
    console.log("service worker load that file, so this release needs a manual port.");
    process.exitCode = 1;
  } else {
    const problems = findScramjetPatchProblems(readFileSync(bundle, "utf8"));
    if (!problems.length) {
      console.log(
        version === installed
          ? "All compatibility patches apply. JSProx already uses this version."
          : "All compatibility patches apply. Update the pinned version, then run npm test.",
      );
    } else {
      console.log(`${problems.length} patch(es) need review in src/scramjet-compat.js:`);
      for (const p of problems)
        console.log(`  - [${p.group}] ${p.name}: ${p.matches === 0 ? "not found" : p.matches + " matches"}`);
      console.log("The upstream bug may be fixed (drop the patch) or the code may have moved (update it).");
      process.exitCode = 1;
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
