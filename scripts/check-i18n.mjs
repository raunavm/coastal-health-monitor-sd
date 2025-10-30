#!/usr/bin/env node
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const translationsPath = path.join(__dirname, "..", "lib", "translations.json")

try {
  const content = fs.readFileSync(translationsPath, "utf8")
  const translations = JSON.parse(content)

  const en = Object.keys(translations.en ?? {})
  const es = Object.keys(translations.es ?? {})

  const missingInEs = en.filter((k) => !es.includes(k))
  const missingInEn = es.filter((k) => !en.includes(k))

  if (missingInEs.length || missingInEn.length) {
    console.error("❌ i18n coverage check failed.")
    if (missingInEs.length) {
      console.error(`\nMissing in ES (${missingInEs.length}):`)
      missingInEs.forEach((k) => console.error(`  - ${k}`))
    }
    if (missingInEn.length) {
      console.error(`\nMissing in EN (${missingInEn.length}):`)
      missingInEn.forEach((k) => console.error(`  - ${k}`))
    }
    process.exit(1)
  } else {
    console.log(`✅ i18n coverage OK (${en.length} keys in EN/ES parity)`)
  }
} catch (error) {
  console.error("❌ Error reading translations:", error.message)
  process.exit(1)
}
