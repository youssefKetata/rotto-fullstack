import type { SearchExperience } from "@/lib/search/schema";
import type { Candidate } from "@/lib/search/types";

/** Show an actual job, using the same-record and time scope of the request. */
export function workHistoryEvidence(
  candidate: Pick<Candidate, "experiences">,
  conditions: SearchExperience[] = [],
) {
  const jobs = [...candidate.experiences].sort(
    (a, b) =>
      Number(a.end_year !== null) - Number(b.end_year !== null) ||
      a.position - b.position,
  );
  const evidence: Candidate["experiences"] = [];
  const includes = (values: string[] | undefined, value: string) =>
    !values ||
    values.some((item) => item.toLowerCase() === value.toLowerCase());
  for (const condition of conditions) {
    if (condition.exclude || !condition.companyTypes?.length) continue;
    const job = jobs.find(
      (job) =>
        (condition.scope !== "current" || job.end_year === null) &&
        (condition.scope !== "past" || job.end_year !== null) &&
        includes(condition.companyTypes, job.company_type) &&
        includes(condition.companies, job.company_name) &&
        includes(condition.titles, job.title),
    );
    if (job && !evidence.some((item) => item.position === job.position))
      evidence.push(job);
  }
  return evidence;
}
