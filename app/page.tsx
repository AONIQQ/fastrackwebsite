'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from "@/components/ui/button"
import CalBookingButton from '@/components/cal/CalBookingButton'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Menu, X } from "lucide-react"

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 transition-colors duration-300">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/pricing">
              <Button variant="ghost" className="text-white text-base">
                Pricing
              </Button>
            </Link>
            <Link href="/student">
              <Button variant="ghost" className="text-white text-base">
                Student
              </Button>
            </Link>
            <Link href="/guide">
              <Button variant="ghost" className="text-white text-base">
                Guide
              </Button>
            </Link>
            <CalBookingButton variant="ghost" className="text-white text-base">
              Sign Up
            </CalBookingButton>
          </nav>
          <Button variant="ghost" className="md:hidden text-white p-2" onClick={toggleMenu} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col items-center space-y-2">
            <Link href="/pricing">
              <Button variant="ghost" className="text-white text-base">
                Pricing
              </Button>
            </Link>
            <Link href="/student">
              <Button variant="ghost" className="text-white text-base">
                Student
              </Button>
            </Link>
            <Link href="/guide">
              <Button variant="ghost" className="text-white text-base">
                Guide
              </Button>
            </Link>
            <CalBookingButton variant="ghost" className="text-white text-base">
              Sign Up
            </CalBookingButton>
          </div>
        )}
      </header>

      <main className="space-y-16 pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-4xl">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                Data-Supported Training for High School Counselors
              </h1>
              <p className="mt-6 text-base sm:text-lg text-blue-100">
                Empower your students to excel with our comprehensive Guidance Counselor Education and Training Program. Boost college readiness, increase college attendance and graduation rates, and elevate student career success through proven and data supported strategies. Our program equips high school counselors with the essential training, education, and tools needed to effectively manage their workload—particularly in the critical area of schedule building. With specialized training in creating optimal schedules that incorporate dual enrollment opportunities, counselors can significantly enhance student outcomes, ensuring a brighter future for every student they guide.
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 shadow-lg border border-gray-200 space-y-10">
            <h2 className="text-3xl sm:text-4xl font-semibold text-center text-[#080b53]">
              See how our training impacts each party involved
            </h2>
            <div className="grid md:grid-cols-12 gap-6">
              <Card className="md:col-span-3 rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex justify-center mb-4">
                    <Image src="/student.png" alt="Students" width={100} height={100} className="rounded-full" style={{ borderRadius: '50%', width: '100px', height: '100px', objectFit: 'cover' }} />
                  </div>
                  <h3 className="text-2xl font-semibold text-center mb-4 bg-[#605dba] text-white py-2 rounded-md">Student</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    <li>Increased highschool and college graduation rate</li>
                    <li>Substantial cost and time savings on a college degree</li>
                    <li>Increased attendance rates</li>
                    <li>Career preparation and enhancement</li>
                    <li>Scholarship and college application enhancement</li>
                    <li>Improved college readiness</li>
                  </ul>
                  <p className="mt-4 text-sm">See details here</p>
                </CardContent>
              </Card>

              <Card className="md:col-span-3 rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex justify-center mb-4">
                    <Image src="/counselor.png" alt="Counselor" width={100} height={100} className="rounded-full" />
                  </div>
                  <h3 className="text-2xl font-semibold text-center mb-4 bg-[#605dba] text-white py-2 rounded-md">Counselors</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    <li><strong>Enhanced Support:</strong> Better assist students in their academic planning and college preparation.</li>
                    <li><strong>Increased Effectiveness:</strong> Use proven strategies and tools to manage dual credit programs efficiently so their time is spent more efficiently, so they can more effectively manage their workload.</li>
                    <li><strong>More Free Time:</strong> Counselors will have more free time to focus on other important aspects of their job.</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="md:col-span-6 rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex justify-center mb-4">
                    <Image src="/principal.png" alt="School Leadership" width={100} height={100} className="rounded-full" />
                  </div>
                  <h3 className="text-2xl font-semibold text-center mb-4 bg-[#605dba] text-white py-2 rounded-md">School Leadership (Principals and Superintendents)</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    <li><strong>Improved School Performance Metrics:</strong> Increased graduation rates, college enrollment, and overall academic achievement boost district and school-wide performance indicators.</li>
                    <li><strong>Attractiveness to Families and Students:</strong> Offering dual credit programs makes the school more attractive to parents and students looking for academic opportunities, helping with recruitment and retention.</li>
                    <li><strong>Enhanced rankings and Recognition:</strong> Meeting state and federal college readiness benchmarks can improve school and district accountability ratings, leading to recognition and awards.</li>
                    <li><strong>Budget Efficiency and Funding:</strong> Schools offering increased dual enrollment qualify for grants. Lower remediation rates for graduates save districts money in long-term costs.</li>
                    <li><strong>Community and Institutional Partnerships:</strong> Strengthened relationships with local colleges, universities, and businesses, fostering community involvement and support for educational initiatives.</li>
                    <li><strong>Leadership Legacy:</strong> Principals and superintendents leave a lasting impact by implementing programs that prepare students for future success, solidifying their leadership legacy.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
            <div className="text-center">
              <Link href="/pricing">
                <Button className="bg-[#605dba] hover:bg-[#4e4a9e] text-white text-xl px-12 py-6 rounded-xl">
                  See Pricing and Funding Options
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 shadow-lg border border-gray-200 space-y-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#080b53]">
              Training Counselors to Bolster Student Success
            </h2>
            <p className="max-w-3xl mx-auto text-gray-700">
              ASCA recommends a 250:1 ratio of students to school counselors for student success, most schools are far from this recommendation, with the national average of 385:1 for the 2022–2023 school year (Source).
            </p>
            <div className="flex justify-center">
              <Image
                src="/chart.png"
                alt="Student to School Counselor Ratio Chart"
                width={1000}
                height={500}
                className="rounded-2xl shadow-lg max-w-full h-auto"
              />
            </div>
            <p className="max-w-3xl mx-auto text-gray-700">
              We understand it might not be feasible to hire another counselor due to budget constraints, which is why this training was created. When counselors are given the best education, tools, and training they can use their time more efficiently and their workload significantly decreases. This offsets the challenge of having an otherwise unfavorable student to counselor ratio, without having to make another hire.
            </p>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 shadow-lg border border-gray-200 space-y-10">
            <h2 className="text-3xl sm:text-4xl font-semibold text-center text-[#080b53]">
              The Impact of dual enrollment programs on student outcomes
            </h2>
            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-1/2">
                <div className="flex flex-col gap-4">
                  <Image src="/kid1.png" alt="Group of students" width={600} height={400} className="rounded-lg" />
                  <div className="grid grid-cols-2 gap-4">
                    <Image src="/kid2.png" alt="Student with laptop" width={300} height={200} className="rounded-lg" />
                    <Image src="/kid3.png" alt="Students in science class" width={300} height={200} className="rounded-lg" />
                  </div>
                </div>
              </div>
              <div className="md:w-1/2">
                <Card className="mb-4 rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                  <CardHeader className="bg-[#080b53] text-white">
                    <CardTitle className="text-2xl">Increased Graduation Rates</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <p className="mb-4 text-sm">Students who took dual enrollment courses were 10% more likely to complete a Bachelor&apos;s degree than those who did not. The effect was even stronger (12%) for first-generation college students, as well as underprivileged students. (NACEP)</p>
                    <p className="text-sm">Dual enrollment has a positive impact on high school graduation rates, college enrollment percentages, college success metrics, college completion rates, and increased student academic performance in both high school and college. (New Directions for higher education)</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                  <CardHeader className="bg-[#080b53] text-white">
                    <CardTitle className="text-2xl">Shortened College Graduation Time</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <p className="mb-4 text-sm">Students who participated in dual enrollment programs reduced the time it took to earn an associate&apos;s degree by 1.7 years and a bachelor&apos;s degree by approximately 0.4 years compared to students who did not take dual enrollment courses (Community College Research Center).</p>
                    <p className="text-sm">Students with dual enrollment credits complete their associate&apos;s degrees 262 days sooner and their bachelor&apos;s degrees 167 days sooner than students without such credits (Community College Research Center).</p>
                  </CardContent>
                </Card>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardHeader className="bg-[#080b53] text-white">
                  <CardTitle className="text-2xl">Reduced Costs</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="mb-4 text-sm sm:text-base">The average cost of a traditional college credit hour is $559​ (College Savings Guide)</p>
                  <p className="mb-4 text-sm sm:text-base">For a four-credit dual enrollment class, this would be $2,236 in tuition. Compare that to a Dual enrollment class which typically costs between $0 and $100 per credit, depending on the state and the funding available​ (College Savings Guide)​ (Fastweb)</p>
                  <p className="mb-4 text-sm sm:text-base">If we use the average ($559 vs. $50) we can see that dual credit are on average 11.18 times cheaper than traditional college credits.</p>
                  <p className="mb-4 text-sm sm:text-base">Students can shave off up to two full years of college through dual enrollment, saving on both tuition as discussed above, and living expenses. The savings from room and board alone can range from $10,000 to $50,000+ per year​ (Achieve Virtual - Home).</p>
                  <p className="text-sm sm:text-base">Taking dual credit courses is a great solution to assist underprivileged and first generation college students in affording their college degree, as it can be 25-50% cheaper.</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardHeader className="bg-[#080b53] text-white">
                  <CardTitle className="text-2xl">Scholarship and College Application Enhancement</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-sm sm:text-base">Dual enrollment significantly enhances students&apos; opportunities for scholarships and strengthens their college applications. A study by the Community College Research Center found that students who participated in dual enrollment were 12% more likely to apply to and be admitted to moderately or highly selective colleges compared to their peers who did not participate​ (Academic Commons)​ (ERIC). This increased likelihood of admission to selective institutions can make students more competitive candidates for merit-based scholarships, further enhancing their college applications and reducing the cost of their education.</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardHeader className="bg-[#080b53] text-white">
                  <CardTitle className="text-2xl">Higher Career Preparation</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-sm sm:text-base">Dual enrollment programs not only boost academic success but also provide students with early exposure to career-focused courses. This enables students to better connect their high school education to future career pathways​ (ED Blog).</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardHeader className="bg-[#080b53] text-white">
                  <CardTitle className="text-2xl">Increased College Readiness</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="mb-4 text-sm sm:text-base">Dual enrollment programs significantly enhance college readiness based on several specific metrics. For instance, students who participate in dual enrollment are twice as likely to meet college readiness benchmarks in English and math compared to their peers who do not participate​ (Colleges of Distinction).</p>
                  <p className="mb-4 text-sm sm:text-base">A study by the National Alliance of Concurrent Enrollment Partnerships (NACEP) found that dual enrollment students are 10% more likely to place into credit-bearing college courses without needing remediation​ (NACEP).</p>
                  <p className="text-sm sm:text-base">Additionally, 88% of dual enrollment students demonstrated higher levels of college persistence, maintaining continuous enrollment from their first to second year of college​ (Colleges of Distinction). These statistics underscore the effectiveness of dual enrollment in equipping students with the academic skills and habits necessary for college-level work.</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <CardHeader className="bg-[#080b53] text-white">
                  <CardTitle className="text-2xl">Student Satisfaction</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-sm sm:text-base">Student schedule adherence, excitement, engagement, and satisfaction metrics have been shown to be higher when students participate in dual enrollment programs.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 shadow-lg border border-gray-200 space-y-8">
            <h2 className="text-3xl sm:text-4xl font-semibold text-center text-[#080b53]">
              Our training solves the most common issues counselors face
            </h2>
            <p className="text-center max-w-3xl mx-auto text-sm sm:text-base text-gray-700">
              We have compiled data from counselors via studies, surveys, and questionnaires. When Counselors are asked to describe what aspects of their job they are struggling with, there are three top responses. Our training addresses these challenges directly with proven solutions. Additionally, our experience in providing schedule-building services to students who couldn&apos;t get expert advice from their counselors has given us deep, targeted insights into best practices that counselors can adopt for better outcomes.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
            <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <CardHeader className="bg-[#080b53] text-white">
                <CardTitle className="text-2xl">Heavy Workloads and Limited Time</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-sm sm:text-base">Counselors often handle too many students, with national ratios averaging 385 students per counselor, far above the recommended 250:1 ratio. This limits their ability to provide individualized attention and can lead to burnout. Many counselors say its very difficult for them to complete all of their responsibilities because of time constraints. ​(National Education Association | NEA).</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <CardHeader className="bg-[#080b53] text-white">
                <CardTitle className="text-2xl">Staying up to date on College and Career Guidance</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-sm sm:text-base">With an evolving landscape of higher education and career options, counselors often struggle to stay updated and provide accurate, personalized advice. Training programs focused on staying current with trends and leveraging data to guide students greatly improve outcomes​ (SchoolCounselor_CA).</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <CardHeader className="bg-[#080b53] text-white">
                <CardTitle className="text-2xl">Student Motivation</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-sm sm:text-base">Rising mental health issues among students are a growing concern. Counselors often feel unprepared to handle the increasing demand for mental health services related to motivating and inspiring their students.(SchoolCounselor_CA).</p>
              </CardContent>
            </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 shadow-lg border border-gray-200 space-y-8">
            <h2 className="text-3xl sm:text-4xl font-semibold text-center text-[#080b53]">
              What our program includes
            </h2>
            <p className="text-center text-sm sm:text-base text-gray-700">
              For your convenience, these materials are accessible anytime and can be completed at your own pace through our online portal. We also offer live training via webinar, or in-person training, if that&apos;s a better fit for your needs. Live or in person modalities will require prior coordination before enrollment.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
            <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <CardHeader className="bg-[#080b53] text-white">
                <CardTitle className="text-2xl">Education</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
                  <li>Teaching counselors the intricacies of dual enrollment programs and their impact on student success.</li>
                  <li>How to get students to care about what dual credit courses are, why they are a valuable resource, and why they should consider taking as many of these courses as they can.</li>
                  <li>How to increase dual credit enrollments in your school/district.</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <CardHeader className="bg-[#080b53] text-white">
                <CardTitle className="text-2xl">Training</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
                  <li>Step by step process on how to create a highschool schedule that includes the highest number of optimal dual credit courses using our FuturePrep system selection process.</li>
                  <li>How to manage the current workload more effectively so that each student gets the best assistance. Our data driven approach is based on the most common problem areas across our survey of guidance counselors from a comprehensive representation of schools throughout the United States.</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <CardHeader className="bg-[#080b53] text-white">
                <CardTitle className="text-2xl">Tools</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
                  <li>Access to the Fastrack College Return on Investment Calculator, which shows students and parents the amount of money they can save by participating in dual enrollment programs.</li>
                  <li>Presentations that drive dual enrollment metrics.</li>
                  <li>Survey templates that increase student success and satisfaction.</li>
                  <li>Standard operating procedures for counselors to manage workload and increase productivity.</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <CardHeader className="bg-[#080b53] text-white">
                <CardTitle className="text-2xl">Support</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
                  <li>Ongoing support to questions that may come up while your learning and applying the course material.</li>
                  <li>Course material consistently researched and updated based on the consensus of experts in the field.</li>
                  <li>Feedback consistently implemented to improve the training experience, increase practical effectiveness, and boost adherence.</li>
                </ul>
              </CardContent>
            </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 shadow-lg border border-gray-200 text-center">
            <Link href="/pricing">
              <Button className="bg-[#605dba] hover:bg-[#4e4a9e] text-white text-xl px-12 py-6 rounded-xl">
                See Pricing and Funding Options
              </Button>
            </Link>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 shadow-lg border border-gray-200 space-y-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#080b53]">
              We Are Proud Members of:
            </h2>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center items-center gap-8">
              <Image src="/aera.png" alt="AERA Logo" width={200} height={100} className="w-full sm:w-auto max-w-[200px]" />
              <Image src="/nea.png" alt="NEA Logo" width={200} height={100} className="w-full sm:w-auto max-w-[200px]" />
              <Image
                src="/pdk.png"
                alt="PDK Logo"
                width={200}
                height={100}
                className="w-full sm:w-auto max-w-[200px]"
              />
              <Image src="/edrising.png" alt="Educators Rising Logo" width={200} height={100} className="w-full sm:w-auto max-w-[200px]" />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#080b53] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center">
            <Image src="/logo.png" alt="Fastrack Logo" width={200} height={200} className="mb-4" />
            <address className="text-center not-italic text-sm sm:text-base">
              1007 N Orange St<br />
              Wilmington, Delaware<br />
              info@fastrack.school
            </address>
            <Link href="/privacypolicy" className="mt-4 text-sm underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
