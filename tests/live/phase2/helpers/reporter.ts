const fs = require('fs');

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  note?: string;
}

class Reporter {
  private results: TestResult[] = [];

  push(result: TestResult): void {
    this.results.push(result);
  }

  print(): void {
    const pad = (s: string, n: number) => (s + " ".repeat(Math.max(0, n - s.length))).slice(0, n);
    
    console.log("\n=== Phase 2 Live Test Report ===");
    console.log(pad("Test", 40), pad("Status", 8), "Notes");
    console.log("-".repeat(70));
    
    this.results.forEach(r => 
      console.log(pad(r.name, 40), pad(r.status, 8), r.note || "")
    );
    
    const passCount = this.results.filter(r => r.status === 'PASS').length;
    const failCount = this.results.filter(r => r.status === 'FAIL').length;
    const skipCount = this.results.filter(r => r.status === 'SKIP').length;
    
    console.log("\n📊 Summary:");
    console.log(`✅ PASS: ${passCount}`);
    console.log(`❌ FAIL: ${failCount}`);
    console.log(`⚠️  SKIP: ${skipCount}`);
    console.log(`📈 Total: ${this.results.length}`);
  }

  writeMd(path: string = "./tests/live/phase2/RUN.md"): void {
    const md = [
      "# Phase 2 Live Test Report",
      "",
      "## Summary",
      "",
      `- **Total Tests:** ${this.results.length}`,
      `- **PASS:** ${this.results.filter(r => r.status === 'PASS').length}`,
      `- **FAIL:** ${this.results.filter(r => r.status === 'FAIL').length}`,
      `- **SKIP:** ${this.results.filter(r => r.status === 'SKIP').length}`,
      "",
      "## Test Results",
      "",
      "| Test | Status | Notes |",
      "|------|--------|-------|",
      ...this.results.map(r => `| ${r.name} | ${r.status} | ${r.note || ""} |`)
    ].join("\n");

    fs.writeFileSync(path, md, "utf8");
    console.log(`\n📝 Report written to: ${path}`);
  }

  getResults(): TestResult[] {
    return this.results;
  }
}

module.exports = { Reporter };
