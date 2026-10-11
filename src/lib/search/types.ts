export type Candidate = {
  id: string;
  full_name: string;
  avatar_url: string;
  headline: string;
  current_title: string;
  current_company: string;
  current_company_logo_url: string;
  role: string;
  seniority: string;
  years_experience: number;
  city: string;
  state: string;
  country: string;
  open_to_work: boolean;
  skills: string[];
  experiences: {
    position: number;
    title: string;
    company_name: string;
    company_logo_url: string;
    company_type: string;
    start_year: number;
    end_year: number | null;
    description: string;
  }[];
  education: {
    position: number;
    school: string;
    degree: string;
    field: string;
    graduation_year: number | null;
  }[];
};
