// A synthetic ontology far larger than any consumer's today, for feature #135's scaling acceptance:
// bounded contexts of 20 entities each, with role words such as "ledger" reused across contexts
// (about 24 of 60), as real ontologies reuse words.
//
//   node tests/helpers/large-ontology.mjs <out-dir> [contexts]
// writes ontology.md, one-context.md (three names from one context) and every-context.md (one name
// from each context, one paragraph each).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROLE_WORDS = ["Account", "Ledger", "Invoice", "Payment", "Refund", "Policy", "Quota", "Tariff", "Voucher", "Batch",
  "Shipment", "Parcel", "Carrier", "Route", "Depot", "Booking", "Venue", "Ticket", "Seat", "Guest",
  "Patient", "Ward", "Referral", "Clinic", "Dosage", "Tenant", "Lease", "Meter", "Reading", "Tariffs",
  "Sensor", "Gateway", "Firmware", "Alarm", "Shift", "Roster", "Badge", "Locker", "Asset", "Survey",
  "Budget", "Forecast", "Pledge", "Grant", "Donor", "Course", "Lesson", "Grade", "Cohort", "Mentor"];
const SYLLABLES = ["ka", "ro", "vel", "dun", "mir", "tas", "quo", "zen", "pli", "gor", "hax", "bri", "sol", "nym"];

export const LARGE_SECTIONS = { required: ["Entities", "Enums", "Relationships", "Business Rules & Invariants"], optional: [] };

export function contextName(index) {
  const word = SYLLABLES[index % 14] + SYLLABLES[Math.floor(index / 14) % 14] + SYLLABLES[Math.floor(index / 196) % 14] + "ix";
  return word[0].toUpperCase() + word.slice(1);
}

export const contextEntities = (index) =>
  Array.from({ length: 20 }, (_, j) => `${contextName(index)}${ROLE_WORDS[(j + index * 7) % ROLE_WORDS.length]}`);

export function largeOntology(contexts = 60) {
  const entities = [];
  const enums = [];
  const relationships = [];
  const invariants = [];
  for (let c = 0; c < contexts; c++) {
    const names = contextEntities(c);
    names.forEach((name, j) => {
      const next = names[(j + 1) % names.length];
      entities.push(`| \`${name}\` | \`${name[0].toLowerCase()}${name.slice(1)}Id\`, \`createdAt\`, \`ownerRef\` | One ${name} held by the ${contextName(c)} context; it refers to one \`${next}\` and is audited on every change. |`);
      if (j % 2 === 0) relationships.push(`| \`${name}\` | owns | \`${next}\` | 1 → many |`);
    });
    enums.push(`| \`${contextName(c)}Phase\` | \`Drafted\`, \`Approved\`, \`Retired\` | Where a \`${names[0]}\` stands. |`);
    invariants.push(`- **\`${names[0]}\`** — is never deleted, only retired.`);
  }
  return ["# Scaling fixture — Application Ontology", "", "## Entities", "", "| Name | Properties | Description |", "| --- | --- | --- |", ...entities, "", "---", "",
    "## Enums", "", "| Name | Values | Description |", "| --- | --- | --- |", ...enums, "", "---", "",
    "## Relationships", "", "| From | Relationship | To | Cardinality |", "| --- | --- | --- | --- |", ...relationships, "", "---", "",
    "## Business Rules & Invariants", "", ...invariants, ""].join("\n");
}

export function oneContextText(index = 3) {
  const [a, b, c] = contextEntities(index);
  return `The ${a} is posted to the ${b} before the ${c} closes.\n`;
}

export function everyContextText(contexts = 60) {
  return Array.from({ length: contexts }, (_, c) => `The ${contextEntities(c)[0]} is reconciled nightly.`).join("\n\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [out, contextsArg = "60"] = process.argv.slice(2);
  if (!out) {
    console.error("usage: large-ontology.mjs <out-dir> [contexts]");
    process.exit(2);
  }
  const contexts = Number(contextsArg);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ontology.md"), largeOntology(contexts));
  writeFileSync(join(out, "one-context.md"), oneContextText());
  writeFileSync(join(out, "every-context.md"), everyContextText(contexts));
}
