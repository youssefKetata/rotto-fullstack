import "server-only";

import type postgres from "postgres";
import type { SearchCriteria, SearchFilters, SearchLocation } from "./schema";

type Sql = postgres.ISql;
type Fragment = postgres.Fragment;

function combine(sql: Sql, clauses: Fragment[], operator: "and" | "or") {
  if (!clauses.length) return operator === "and" ? sql`true` : sql`false`;
  return clauses
    .slice(1)
    .reduce(
      (result, clause) =>
        operator === "and"
          ? sql`(${result} and ${clause})`
          : sql`(${result} or ${clause})`,
      clauses[0],
    );
}

function locations(sql: Sql, values: SearchLocation[]) {
  return combine(
    sql,
    values.map((location) => {
      const clauses: Fragment[] = [];
      if (location.city)
        clauses.push(
          sql`lower(candidate.city) = ${location.city.toLowerCase()}`,
        );
      if (location.state)
        clauses.push(
          sql`lower(candidate.state) = ${location.state.toLowerCase()}`,
        );
      if (location.country)
        clauses.push(
          sql`lower(candidate.country) = ${location.country.toLowerCase()}`,
        );
      return clauses.length ? combine(sql, clauses, "and") : sql`false`;
    }),
    "or",
  );
}

// Only fixed columns/operators enter SQL. Every filter value is a bound parameter.
function criteria(sql: Sql, value: SearchCriteria): Fragment {
  if (!Object.keys(value).length) return sql`false`;
  const clauses: Fragment[] = [];
  function textSet(
    column: Fragment,
    values: string[] | undefined,
    exclude = false,
    target = clauses,
  ) {
    if (!values) return;
    const predicate = sql`${column} = any(${sql.array(values.map((item) => item.toLowerCase()))}::text[])`;
    target.push(exclude ? sql`not (${predicate})` : predicate);
  }
  textSet(sql`lower(candidate.role)`, value.roles);
  textSet(sql`lower(candidate.role)`, value.excludeRoles, true);
  textSet(sql`candidate.seniority`, value.seniorities);
  textSet(sql`candidate.seniority`, value.excludeSeniorities, true);
  if (value.minYears !== undefined)
    clauses.push(sql`candidate.years_experience >= ${value.minYears}`);
  if (value.maxYears !== undefined)
    clauses.push(sql`candidate.years_experience <= ${value.maxYears}`);
  if (value.openToWork !== undefined)
    clauses.push(sql`candidate.open_to_work = ${value.openToWork}`);
  const skills = sql`array(select lower(skill) from unnest(candidate.skills) as skill)`;
  if (value.skillsAll)
    clauses.push(
      sql`${skills} @> ${sql.array(value.skillsAll.map((item) => item.toLowerCase()))}::text[]`,
    );
  if (value.skillsAny)
    clauses.push(
      sql`${skills} && ${sql.array(value.skillsAny.map((item) => item.toLowerCase()))}::text[]`,
    );
  if (value.skillsNone)
    clauses.push(
      sql`not (${skills} && ${sql.array(value.skillsNone.map((item) => item.toLowerCase()))}::text[])`,
    );
  if (value.locations) clauses.push(locations(sql, value.locations));
  if (value.excludeLocations)
    clauses.push(sql`not (${locations(sql, value.excludeLocations)})`);

  for (const condition of value.experience ?? []) {
    const predicates = [sql`experience.candidate_id = candidate.id`];
    if (condition.scope === "current")
      predicates.push(sql`experience.end_year is null`);
    if (condition.scope === "past")
      predicates.push(sql`experience.end_year is not null`);
    textSet(
      sql`experience.company_type`,
      condition.companyTypes,
      false,
      predicates,
    );
    textSet(
      sql`lower(experience.company_name)`,
      condition.companies,
      false,
      predicates,
    );
    textSet(sql`lower(experience.title)`, condition.titles, false, predicates);
    const predicate = sql`exists (select 1 from public.candidate_experiences as experience where ${combine(sql, predicates, "and")})`;
    clauses.push(condition.exclude ? sql`not (${predicate})` : predicate);
  }
  for (const condition of value.education ?? []) {
    const predicates = [sql`education.candidate_id = candidate.id`];
    textSet(sql`lower(education.degree)`, condition.degrees, false, predicates);
    textSet(sql`lower(education.school)`, condition.schools, false, predicates);
    textSet(sql`lower(education.field)`, condition.fields, false, predicates);
    if (condition.minGraduationYear !== undefined)
      predicates.push(
        sql`education.graduation_year >= ${condition.minGraduationYear}`,
      );
    if (condition.maxGraduationYear !== undefined)
      predicates.push(
        sql`education.graduation_year <= ${condition.maxGraduationYear}`,
      );
    const predicate = sql`exists (select 1 from public.candidate_education as education where ${combine(sql, predicates, "and")})`;
    clauses.push(condition.exclude ? sql`not (${predicate})` : predicate);
  }
  return combine(sql, clauses, "and");
}

export function matchingCandidates(sql: Sql, filters: SearchFilters) {
  const predicate = filters.issues.some((issue) => issue.required)
    ? sql`false`
    : combine(
        sql,
        filters.anyOf.map((branch) => criteria(sql, branch)),
        "or",
      );
  const score = filters.preferred.reduce(
    (total, preference) =>
      sql`(${total} + case when ${criteria(sql, preference)} then 1 else 0 end)`,
    sql`0`,
  );
  return sql<
    { id: string; years_experience: number; preference_score: number }[]
  >`
    select candidate.id, candidate.years_experience, ${score}::integer as preference_score
    from public.candidates as candidate where ${predicate}`;
}
