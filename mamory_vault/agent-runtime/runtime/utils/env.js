const path = require("path")
const dotenv = require("dotenv")
function loadEnv() {
  const envPath = path.resolve(__dirname, "../..", ".env")
  dotenv.config({ path: envPath })
  return process.env
}
module.exports = { loadEnv }
