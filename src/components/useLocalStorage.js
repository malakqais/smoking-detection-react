import { useEffect, useState } from 'react'

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved == null) return initialValue
      try {
        return JSON.parse(saved)
      } catch {
        // Backward compatibility for previously stored raw values.
        if (typeof initialValue === 'boolean') return saved === 'true'
        if (typeof initialValue === 'number') {
          const n = Number(saved)
          return Number.isNaN(n) ? initialValue : n
        }
        return saved
      }
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue]
}
