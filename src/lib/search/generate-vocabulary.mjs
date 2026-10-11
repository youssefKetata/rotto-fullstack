// Run `node src/lib/search/generate-vocabulary.mjs` after replacing the supplied data.
// Only distinct field metadata is written; never candidate IDs, profiles or descriptions.
import { readFile, writeFile } from "node:fs/promises";

const rows = JSON.parse(
  await readFile(
    new URL("../../../data/candidates.json", import.meta.url),
    "utf8",
  ),
);
const distinct = (select) => [...new Set(rows.flatMap(select))].sort();
const metadata = {
  countries: distinct((candidate) => [candidate.location.country]),
  locations: [
    ...new Map(
      rows.map((candidate) => [
        JSON.stringify(candidate.location),
        candidate.location,
      ]),
    ).values(),
  ].sort((first, second) => first.city.localeCompare(second.city)),
  degrees: distinct((candidate) =>
    candidate.education.map((education) => education.degree),
  ),
  schools: distinct((candidate) =>
    candidate.education.map((education) => education.school),
  ),
  companies: distinct((candidate) =>
    candidate.experiences.map((experience) => experience.company),
  ),
  titles: distinct((candidate) =>
    candidate.experiences.map((experience) => experience.title),
  ),
};
await writeFile(
  new URL("./history-vocabulary.json", import.meta.url),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
