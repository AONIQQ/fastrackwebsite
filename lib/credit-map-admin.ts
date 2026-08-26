import { sql } from './db'

export type CreditMapIntakeRow = {
  id: number
  status: string
  paid_at: string
  submitted_at: string | null
  email: string | null
  student_grade: string | null
  current_school_program: string | null
  graduation_year: number | null
  state: string | null
  dual_enrollment_provider: string | null
  target_college: string | null
  intended_major: string | null
  current_dual_credit: string | null
  planning_context: string | null
}

export async function listCreditMapIntakes(limit = 100) {
  const bounded = Math.max(1, Math.min(250, Math.trunc(limit)))
  return await sql`
    select intake.id, intake.status, sale.paid_at, intake.submitted_at, sale.email,
      intake.student_grade, intake.current_school_program, intake.graduation_year, intake.state,
      intake.dual_enrollment_provider, intake.target_college, intake.intended_major,
      intake.current_dual_credit, intake.planning_context
    from credit_map_intakes intake join sales sale on sale.id = intake.sale_id
    where sale.provider = 'stripe' and sale.paid_at is not null and coalesce(sale.is_fixture, false) = false
    order by coalesce(intake.submitted_at, sale.paid_at) desc, intake.id desc
    limit ${bounded}
  ` as CreditMapIntakeRow[]
}
