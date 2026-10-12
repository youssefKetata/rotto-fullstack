import { readFileSync } from "node:fs";
import type { SearchCriteria } from "../../src/lib/search/schema";

type Person = {
  id: string;
  role: string;
  seniority: string;
  years_experience: number;
  skills: string[];
  open_to_work: boolean;
  location: { city: string; state: string };
  experiences: { company_type: string; end_year: number | null }[];
  education: { degree: string; field: string }[];
};

const people = JSON.parse(
  readFileSync(new URL("../../data/candidates.json", import.meta.url), "utf8"),
) as Person[];
const engineer = (person: Person) => person.role.endsWith(" Engineer");
const engineeringRoles = [
  ...new Set(people.filter(engineer).map((person) => person.role)),
].sort();
const hasSkills = (person: Person, ...skills: string[]) =>
  skills.every((skill) => person.skills.includes(skill));
const backendAustin = (person: Person) =>
  person.role === "Backend Engineer" && person.location.city === "Austin";

function scenario(
  name: string,
  brief: string,
  match: (person: Person) => boolean,
  preference: (person: Person) => number = () => 0,
  issue?: "required" | "optional" | "none",
  excludedFields?: (keyof SearchCriteria)[],
  continuedMatch?: (person: Person) => boolean,
) {
  // The oracle reads the supplied JSON directly, independently of our SQL and
  // the model's filters. Expected matches never go into the provider request.
  const matches = people
    .filter(match)
    .sort(
      (left, right) =>
        preference(right) - preference(left) ||
        right.years_experience - left.years_experience ||
        left.id.localeCompare(right.id),
    );
  return {
    name,
    brief,
    expected_ids: matches.map((person) => person.id),
    expected_first_page: matches.slice(0, 20).map((person) => person.id),
    issue,
    excluded_fields: excludedFields,
    expected_continued_ids: continuedMatch
      ? people
          .filter(continuedMatch)
          .map((person) => person.id)
          .sort()
      : undefined,
  };
}

const staffTexas = (person: Person) =>
  engineer(person) &&
  person.seniority === "staff" &&
  hasSkills(person, "AWS", "Kubernetes") &&
  person.location.state === "TX" &&
  person.experiences.some((job) => job.company_type === "enterprise");

export const regressionCases = [
  scenario(
    "placeholder-brief",
    "Senior backend engineer, 6+ years, Go and PostgreSQL, based in Austin, open to work",
    (person) =>
      backendAustin(person) &&
      person.seniority === "senior" &&
      person.years_experience >= 6 &&
      hasSkills(person, "Go", "Postgres") &&
      person.open_to_work,
    undefined,
    "none",
  ),
  scenario(
    "staff-engineer",
    "Staff engineer with Kubernetes and AWS, enterprise experience, based in Texas",
    staffTexas,
  ),
  scenario(
    "staff-paraphrase",
    "Find staff-level engineers anywhere in TX who know both AWS and Kubernetes and have worked for an enterprise employer",
    staffTexas,
  ),
  scenario(
    "role-alternatives",
    "Backend or DevOps engineers in Texas with both AWS and Kubernetes, excluding junior candidates",
    (person) =>
      ["Backend Engineer", "DevOps Engineer"].includes(person.role) &&
      person.location.state === "TX" &&
      hasSkills(person, "AWS", "Kubernetes") &&
      person.seniority !== "junior",
  ),
  {
    ...scenario(
      "aliases-and-years",
      "React engineers in NYC with over 5 years of total experience",
      (person) =>
        engineer(person) &&
        hasSkills(person, "React") &&
        person.location.city === "New York" &&
        person.years_experience > 5,
    ),
    expected_role_family: engineeringRoles,
  },
  scenario(
    "current-employer",
    "Backend engineers in Austin who currently work at an enterprise company",
    (person) =>
      backendAustin(person) &&
      person.experiences.some(
        (job) => job.company_type === "enterprise" && job.end_year === null,
      ),
  ),
  scenario(
    "optional-availability",
    "Data scientists with a PhD in Statistics, ideally open to work",
    (person) =>
      person.role === "Data Scientist" &&
      person.education.some(
        (item) => item.degree === "PhD" && item.field === "Statistics",
      ),
    (person) => Number(person.open_to_work),
  ),
  scenario(
    "optional-remote",
    "Backend engineers in Austin, preferably remote",
    backendAustin,
    undefined,
    "optional",
  ),
  scenario(
    "skill-specific-years",
    "Backend engineers in Austin with at least 5 years of Go experience",
    () => false,
    undefined,
    "required",
    ["minYears", "maxYears"],
    (person) => backendAustin(person) && hasSkills(person, "Go"),
  ),
  scenario(
    "separate-employers",
    "Backend engineers who have worked at a startup and also at an enterprise",
    (person) =>
      person.role === "Backend Engineer" &&
      ["startup", "enterprise"].every((type) =>
        person.experiences.some((job) => job.company_type === type),
      ),
  ),
  scenario(
    "skill-duration-paraphrase",
    "Austin backend developers who have used Golang for five years",
    () => false,
    undefined,
    "required",
    ["minYears", "maxYears"],
    (person) => backendAustin(person) && hasSkills(person, "Go"),
  ),
  scenario(
    "independent-total-years",
    "Backend engineers in Austin with 8+ total years of experience and at least 5 years using Go",
    () => false,
    undefined,
    "required",
    ["maxYears"],
    (person) =>
      backendAustin(person) &&
      hasSkills(person, "Go") &&
      person.years_experience >= 8,
  ),
  {
    ...scenario(
      "combined-alternatives",
      "React engineers in New York or Vue engineers in San Francisco, excluding junior candidates",
      (person) =>
        engineer(person) &&
        person.seniority !== "junior" &&
        ((person.location.city === "New York" && hasSkills(person, "React")) ||
          (person.location.city === "San Francisco" &&
            hasSkills(person, "Vue"))),
    ),
    expected_role_family: engineeringRoles,
  },
  scenario(
    "employer-exclusion",
    "Engineers in Texas who have never worked at a startup",
    (person) =>
      engineer(person) &&
      person.location.state === "TX" &&
      !person.experiences.some((job) => job.company_type === "startup"),
  ),
];
