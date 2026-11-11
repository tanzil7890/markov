import { useEffect } from 'react'
import { useAppStore } from '../store'

/** Refresh cached auth on surface mount so post-launch revocation appears; retain the cached display while fetching. */
export function useMarkovProfileAuthStatusRefresh(): void {
  const fetchAuthStatus = useAppStore((state) => state.fetchMarkovProfileAuthStatus)
  useEffect(() => {
    void fetchAuthStatus()
  }, [fetchAuthStatus])
}
