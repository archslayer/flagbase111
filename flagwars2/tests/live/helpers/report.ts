const fs = require("fs");

type Row = { name: string, status: "PASS" | "FAIL" | "SKIP", note?: string };

class Reporter {
  rows: Row[] = [];
  
  push(r: Row) { 
    this.rows.push(r); 
  }
  
  print() {
    const pad = (s: string, n: number) => (s + " ".repeat(Math.max(0, n - s.length))).slice(0, n);
    console.log("\n=== Attack E2E Report ===");
    console.log(pad("Test", 40), pad("Status", 8), "Notes");
    console.log("-".repeat(70));
    this.rows.forEach(r => console.log(pad(r.name, 40), pad(r.status, 8), r.note || ""));
  }
  
  writeMd(path = "./reports/attack-e2e-report.md") {
    const md = [
      "# Attack E2E Report",
      "",
      "| Test | Status | Notes |",
      "|------|--------|-------|",
      ...this.rows.map(r => `| ${r.name} | ${r.status} | ${r.note || ""} |`)
    ].join("\n");
    
    try {
      fs.mkdirSync("./reports", { recursive: true });
      fs.writeFileSync(path, md, "utf8");
      console.log(`\nReport written to: ${path}`);
    } catch (error) {
      console.error("Failed to write report:", error);
    }
  }
}

module.exports = { Reporter };
