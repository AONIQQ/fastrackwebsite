# Behavioral tests

Run `npm test`. Tests use Node's built-in runner, require no service credentials,
and must be deterministic and isolated from production.

Later acquisition repair tests should put business logic behind injected database,
clock, provider, and request-boundary interfaces. Use in-memory fakes or labeled
non-production fixtures. The default test command must never load `.env.local`,
send email, call Stripe, create a lead, or mutate a live database. Provider and
database integration checks require separate explicit commands and the owning
task's authorization.
