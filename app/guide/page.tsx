import Link from 'next/link'

const WHOP_CHECKOUT_URL = 'https://whop.com/checkout/4DXyLzCDqEtib03t4d-fKRL-ukfw-a2np-khb2B9MVaq84/'
const VSL_VIDEO_URL = 'https://www.youtube.com/embed/VIDEO_ID'

const benefitBullets = [
  'Cut 1–2 years off a bachelor’s without being a genius or burning out',
  'Save tens of thousands in tuition, housing, and lost years in the workforce',
  'Use dual-credit, AP, CLEP, and summer classes the way colleges don’t explain',
  'Get a clear spreadsheet-style plan instead of random advice from counselors',
  'Works in any U.S. state and for most majors (STEM, business, humanities, etc.)',
]

const whatsInsideSections = [
  {
    title: 'College credit options in high school',
    bullets: [
      'Dual-credit programs (my top recommendation and why)',
      'AP / IB basics and when they actually make sense',
      'CLEP exams and how to use them to skip entire classes',
    ],
  },
  {
    title: 'How to make sure credits actually transfer',
    bullets: [
      'How to research transfer policies before you waste time',
      'Exactly what to ask college advisors so you get straight answers',
      'How many transfer credits most schools accept (and how to pick the right ones)',
      'Simple system to track which class counts for which requirement',
    ],
  },
  {
    title: 'Building the 2-year degree plan',
    bullets: [
      'How many credits per term you realistically need',
      'Using online and night classes to create “hidden” extra time',
      'How to use summer terms and winter sessions without burning out',
    ],
  },
  {
    title: 'Funding and scholarships',
    bullets: [
      'Where to look for state, local, and university-specific scholarships',
      'How accelerated paths and scholarships play together',
      'What to push your high-school counselor on (they often miss these)',
    ],
  },
  {
    title: 'Time and stress management',
    bullets: [
      'How I handled a heavy course load plus work and a social life',
      'Burnout warning signs and how to adjust the plan without derailing progress',
    ],
  },
  {
    title: 'The implementation checklist',
    bullets: [
      '8-step action checklist you can walk through line-by-line',
      'Exactly what to Google, who to email, what to put in your spreadsheets',
    ],
  },
]

const whoThisIsFor = [
  'Parents with a 9th–12th grader who is at least somewhat motivated and willing to take on college-level work',
  'Families with household income around $80k+ who care about not wasting money and time on college',
  'Students aiming for a four-year degree at a public or private university (including many selective schools)',
  'Homeschool, public-school, and private-school families who can flex their high-school schedule a bit',
]

const faqItems = [
  {
    question: 'Is this only for one state?',
    answer:
      'No. The guide is written to work in any U.S. state. The core strategy is the same everywhere: dual credit, AP, CLEP, community college, transfer policies, and smart scheduling. Some details vary by state and school, which is why I show you exactly what to research and what to ask advisors. For states where there are big extra opportunities, I’m creating add-on mini guides.',
  },
  {
    question: 'My kid isn’t a straight-A student. Will this still work?',
    answer:
      'Yes (just ask Alexis!), as long as they’re willing to show up and do the work. You don’t need a perfect GPA. The guide assumes a reasonably motivated student (B/B+ range and up) and shows you how to choose classes and pacing that fit them.',
  },
  {
    question: 'Can this still help if my child is already a junior or senior?',
    answer:
      'Yes. The earlier you start, the more time and money you save, but even starting late can shave off a year or more in many cases. The checklist walks through scenarios if you’re starting in 11th or 12th grade.',
  },
  {
    question: 'Why pay for this instead of reading blogs and asking the counselor?',
    answer:
      'You can absolutely try to piece this together yourself. That’s what I did originally and I still missed opportunities that would have saved another year and more money. This guide compresses years of trial-and-error and dozens of hours of research into a single plan you can follow in a weekend.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'If you go through the guide, follow the checklist, and feel it wasn’t worth the $47, email us within 7 days and we’ll refund you.',
  },
]

function CTAButton({
  label,
  className = '',
  variant = 'primary',
}: {
  label: string
  className?: string
  variant?: 'primary' | 'secondary'
}) {
  const baseClasses =
    'inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-base font-semibold shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto'
  const variantClasses =
    variant === 'secondary'
      ? 'bg-white text-[#5a48f5] hover:bg-blue-50 focus-visible:outline-white'
      : 'bg-[#080b53] text-white hover:bg-[#0f1670] focus-visible:outline-[#080b53]'

  return (
    <Link
      href={WHOP_CHECKOUT_URL}
      className={`${baseClasses} ${variantClasses} ${className}`}
    >
      {label}
    </Link>
  )
}

export default function Guide() {
  return (
    <div className="bg-slate-50 text-gray-900">
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:px-8 md:grid-cols-2 md:items-center md:gap-16 md:py-24">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-[#080b53] sm:text-5xl">
              Graduate College in 2 Years and Save Up to 50% on Tuition
            </h1>
            <p className="mt-6 text-lg text-gray-700">
              A step-by-step guide that shows you exactly how I finished a bachelor’s in 2 years and how your
              kid can do the same using dual-credit, AP, CLEP, summer, and online classes.
            </p>
            <ul className="mt-8 space-y-4 text-base text-gray-800">
              {benefitBullets.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#f8b84a]" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-10 space-y-2">
              <CTAButton label="Get the Fastrack Guide – $47 Instant Download" />
              <p className="text-sm text-gray-600">PDF guide, lifetime access, updates included</p>
            </div>
          </div>
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#080b53]">
              Free video: How we shaved 2 years off our college (and how your kid can too)
            </p>
            <div className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl pb-[56.25%]">
              <iframe
                src={VSL_VIDEO_URL}
                title="Fastrack 2-Year Degree VSL"
                className="absolute inset-0 h-full w-full"
                frameBorder="0"
                loading="lazy"
                allowFullScreen
              />
            </div>
            <div className="space-y-2">
              <CTAButton label="Get the Fastrack Guide – $47 Instant Download" variant="secondary" />
              <p className="text-center text-sm text-gray-600">PDF guide, lifetime access, updates included</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#080b53] py-16 text-white">
        <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold">How Your Kid Can Graduate in 2 Years Instead of 4</h2>
          <p className="text-lg text-blue-100">
            Most families treat college like a four-year default. The truth is, the degree is just a number of credits.
            Once you understand how dual-credit, AP, CLEP, community college, and smart scheduling fit together, you can
            compress four years of credits into about two years of real time. Which saves you a substantial amount of
            money on tuition, kick starts your child&apos;s career, and gets your child out of the cycle of burning out
            before college even ends.
          </p>
          <p className="text-lg text-blue-100">
            In this guide, I walk you through the exact process I used to:
          </p>
          <ul className="space-y-3 text-base text-blue-50">
            <li>Start earning college credits in high school</li>
            <li>Pick a college that accepts a large number of transfer credits</li>
            <li>Stack dual-credit, AP, CLEP, summer, and online classes efficiently</li>
            <li>Finish a computer science bachelor’s in 2 years while working and traveling</li>
          </ul>
          <p className="text-lg text-blue-100">
            You do not need a “perfect student” to make this work. You do need a motivated kid (roughly 3.0–3.5+ GPA and
            willing to work) and a clear plan.
          </p>
          <CTAButton label="Get the Fastrack Guide – $47" variant="secondary" />
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
          <div>
            <h2 className="text-3xl font-semibold text-[#080b53]">What You Get Inside the Fastrack Guide</h2>
            <p className="mt-2 text-lg text-gray-700">A 15-page, step-by-step plan you can actually follow with your kid.</p>
          </div>
          <div className="space-y-8 rounded-3xl bg-white p-8 shadow-lg">
            {whatsInsideSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xl font-semibold text-[#080b53]">{section.title}</h3>
                <ul className="mt-3 list-disc space-y-2 pl-6 text-gray-700">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-base text-gray-700">
            You’re not getting theory. You’re getting the playbook I used, plus improvements I’ve found since.
          </p>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-[#080b53]">Who This Guide Is For</h2>
          <ul className="space-y-3 text-base text-gray-800">
            {whoThisIsFor.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-[#f8b84a]" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-base text-gray-700">
            If your kid is capable of a B average and can follow instructions, this can work for you.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-5xl space-y-10 px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-[#080b53]">Who’s Behind Fastrack?</h2>
          <div className="grid gap-8 md:grid-cols-2">
            <article className="rounded-3xl bg-white p-8 shadow-lg">
              <h3 className="text-2xl font-semibold text-[#080b53]">Andrew – Founder of Fastrack</h3>
              <p className="mt-4 text-gray-700">
                I’m Andrew. I finished my bachelor’s in computer science in 2 years by stacking dual-credit and university courses. I started taking college classes as a high-school sophomore, walked into
                a full bachelor’s by 20, and used the time and money I saved to start businesses and travel instead of
                sitting in extra classrooms. This guide is the cleaned-up version of what I wish my family and I had when
                we were figuring it out from scratch.
              </p>
            </article>
            <article className="rounded-3xl bg-white p-8 shadow-lg">
              <h3 className="text-2xl font-semibold text-[#080b53]">Alexis – Using the Same System Right Now</h3>
              <p className="mt-4 text-gray-700">
                Alexis is my younger sister. She finished high school with 30 college credits already done and is on track
                to finish her degree in 2 years as well. She’s the person you’ll see in most of the videos talking to
                parents and students about how this looks from the student side.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-[#080b53]">What Happens When You Buy</h2>
          <ol className="list-decimal space-y-6 pl-6 text-gray-800">
            <li>You click “Get the Fastrack Guide – $47” and complete checkout.</li>
            <li>You get instant access to the PDF guide plus any future updates.</li>
            <li>
              Inside the guide, you’ll see links to optional extras like:
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>A pre-built schedule template you can plug your classes into</li>
                <li>State-specific mini guides where needed</li>
              </ul>
            </li>
            <li>
              You sit down with your kid for 60–90 minutes, walk through the checklist, and start mapping out their actual
              plan.
            </li>
          </ol>
          <p className="text-base text-gray-700">
            You can do this entire process yourself with the guide. If you ever want more help later, you’ll also see
            options for higher-touch support.
          </p>
          <CTAButton label="Get the Fastrack Guide – $47" />
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-5xl space-y-8 px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-[#080b53]">Questions Parents Ask Before They Buy</h2>
          <div className="space-y-6 rounded-3xl bg-white p-8 shadow-lg">
            {faqItems.map((item) => (
              <div key={item.question}>
                <h3 className="text-lg font-semibold text-[#080b53]">{item.question}</h3>
                <p className="mt-2 text-gray-700">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#080b53] py-16 text-white">
        <div className="mx-auto max-w-3xl space-y-6 px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold">Ready to compress college into 2 years?</h2>
          <p className="text-lg text-blue-100">
            Get the exact strategy, templates, and checklist to plan it out in a weekend.
          </p>
          <CTAButton label="Get the Fastrack Guide – $47 Instant Download" variant="secondary" className="mx-auto" />
        </div>
      </section>

  
    </div>
  )
}
