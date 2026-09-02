'use client'

import { useEffect } from 'react'

import { reportClientError } from './reportClientError'

// Catches what React error boundaries cannot: errors thrown outside render and
// unhandled promise rejections (e.g. a data fetch chain with no .catch()).
export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event) => {
      const error =
        event?.error instanceof Error
          ? event.error
          : {
              message: event?.message || 'Uncaught error',
              stack: `${event?.filename || ''}:${event?.lineno || 0}:${event?.colno || 0}`,
            }
      reportClientError(error, { kind: 'window-error' })
    }

    const onRejection = (event) => {
      const reason = event?.reason
      reportClientError(
        reason instanceof Error ? reason : { message: `Unhandled rejection: ${String(reason)}` },
        { kind: 'unhandled-rejection' },
      )
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
