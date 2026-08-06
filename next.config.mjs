/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        // The parent/student page is now the homepage. /student is kept as a
        // permanent redirect rather than deleted: it is the destination of the
        // calculator's CTA, of every results email already sent, and of any ad
        // or link pointing at it. A 308 also folds its search history into "/"
        // instead of leaving two pages competing for the same terms.
        source: '/student',
        destination: '/',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
