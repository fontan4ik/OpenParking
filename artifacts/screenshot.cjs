// Compatibility entrypoint. Prefer the package scripts documented in the integration guide.
require("../apps/frontend/scripts/visual-qa.cjs")
  .main(process.argv.slice(2))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
