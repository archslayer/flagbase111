require('dotenv').config({ path: '.env.local' });
const { runAttackE2E } = require("./attack.e2e");

(async () => {
  const r = await runAttackE2E();
  r.print();
  r.writeMd();
  
  // process exit code
  const failed = r.rows.some((x: any) => x.status === "FAIL");
  process.exit(failed ? 1 : 0);
})();
