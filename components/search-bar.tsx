'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, MapPin, Loader2 } from 'lucide-react'
import { HoloPanel } from './holo/holo-panel'
import type { SelectedCity } from './jarvis-map'

interface SearchResult {
  place_id: number
  display_name: string
  name: string
  lat: string
  lon: string
  address?: {
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
  }
}

interface SearchBarProps {
  onCitySelect: (city: SelectedCity) => void
  isLoading: boolean
}

const PLACEHOLDER = 'Search location, coordinates, intelligence node...'

export function SearchBar({ onCitySelect, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      setResults(data.slice(0, 5))
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => handleSearch(value), 300)
  }

  const handleSelect = (result: SearchResult) => {
    const cityName =
      result.address?.city || result.address?.town || result.address?.village || result.name

    onCitySelect({
      name: cityName,
      displayName: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      country: result.address?.country,
      state: result.address?.state,
    })

    setQuery(cityName)
    setResults([])
    setIsFocused(false)
    setIsExpanded(false)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }

  const handleMobileExpand = () => {
    setIsExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFocused(false)
        setIsExpanded(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const busy = isSearching || isLoading

  const ResultRow = ({ result }: { result: SearchResult }) => (
    <button
      onClick={() => handleSelect(result)}
      className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-jarvis-cyan/10"
    >
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-jarvis-cyan transition-transform group-hover:scale-110" />
      <div className="min-w-0">
        <p className="truncate font-heading text-sm font-semibold tracking-wide text-foreground">
          {result.address?.city || result.address?.town || result.address?.village || result.name}
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{result.display_name}</p>
      </div>
    </button>
  )

  return (
    <>
      {/* Desktop */}
      <div className="absolute left-1/2 top-6 z-50 hidden w-full max-w-lg -translate-x-1/2 px-4 md:block">
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative">
          {/* Focus glow pulse (subtle) */}
          <motion.div
            className="pointer-events-none absolute -inset-1 rounded-xl"
            animate={{
              boxShadow: isFocused
                ? '0 0 24px var(--glow-cyan-mid)'
                : '0 0 0px rgba(0,0,0,0)',
            }}
            transition={{ duration: 0.4 }}
          />
          <HoloPanel active={isFocused} className="overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <motion.div animate={{ scale: isFocused ? 1.1 : 1, rotate: busy ? 360 : 0 }} transition={busy ? { repeat: Infinity, duration: 1, ease: 'linear' } : { duration: 0.3 }}>
                {busy ? (
                  <Loader2 className="h-5 w-5 text-jarvis-cyan" />
                ) : (
                  <Search
                    className="h-5 w-5 text-jarvis-cyan transition-all"
                    style={{ filter: isFocused ? 'drop-shadow(0 0 6px var(--glow-cyan-hard))' : 'none' }}
                  />
                )}
              </motion.div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                placeholder={PLACEHOLDER}
                className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
              />
              {query && (
                <button onClick={handleClear} className="text-muted-foreground transition-colors hover:text-jarvis-cyan">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <AnimatePresence>
              {results.length > 0 && isFocused && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-jarvis-cyan/20"
                >
                  <ul className="py-1">
                    {results.map((result) => (
                      <li key={result.place_id}><ResultRow result={result} /></li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </HoloPanel>
        </motion.div>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        {!isExpanded ? (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={handleMobileExpand}
            className="holo-panel glow-md fixed right-4 top-4 z-50 flex h-12 w-12 items-center justify-center rounded-full"
          >
            <Search className="h-5 w-5 text-jarvis-cyan" />
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-jarvis-bg/95 backdrop-blur-lg"
          >
            <div className="p-4">
              <div className="mb-4 flex items-center gap-3">
                <button onClick={() => { setIsExpanded(false); setResults([]) }} className="text-muted-foreground hover:text-jarvis-cyan">
                  <X className="h-6 w-6" />
                </button>
                <span className="holo-label text-xs text-jarvis-cyan">TACTICAL SEARCH</span>
              </div>

              <HoloPanel active>
                <div className="flex items-center gap-3 p-4">
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-jarvis-cyan" />
                  ) : (
                    <Search className="h-5 w-5 text-jarvis-cyan" />
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder={PLACEHOLDER}
                    className="flex-1 bg-transparent font-mono text-base text-foreground outline-none placeholder:text-muted-foreground/70"
                    autoFocus
                  />
                  {query && (
                    <button onClick={handleClear} className="text-muted-foreground">
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </HoloPanel>

              <div className="mt-4 space-y-2">
                {results.map((result) => (
                  <motion.div key={result.place_id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                    <HoloPanel corners={false} className="overflow-hidden">
                      <ResultRow result={result} />
                    </HoloPanel>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </>
  )
}
