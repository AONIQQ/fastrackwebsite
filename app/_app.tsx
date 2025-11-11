import type { AppProps } from 'next/app'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <Component {...pageProps} />
      <ToastViewport />
    </ToastProvider>
  )
}

export default MyApp