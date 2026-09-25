import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.resolve(__dirname, "../../.github/workflows/ci.yml"), "utf8");

describe("CI workflow", () => {
  it("targets one editable GitHub environment and does not print the key", () => {
    expect(workflow).toMatch(/environment:\s+"Atmosphere \/ production"/);
    expect(workflow.match(/Atmosphere \/ production/g)).toHaveLength(1);
    expect(workflow).toMatch(/OPENAI_API_KEY is not available\. Skipping real-provider tests\./);
    expect(workflow).not.toMatch(/echo\s+[^\n]*\$\{?OPENAI_API_KEY\}?/);
    expect(workflow).not.toMatch(/echo\s+[^\n]*\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/);
    expect(workflow).not.toMatch(/\bset -x\b/);
    expect(workflow).toMatch(/secrets\.OPENAI_API_KEY/);
    expect(workflow).toMatch(/actions\/upload-artifact@v4/);
    expect(workflow).toMatch(/publish_accuracy_report\.py/);
  });
});
