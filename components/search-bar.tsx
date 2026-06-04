'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, MapPin, Loader2 } from 'lucide-react'
import { HudCorners } from './hud-corners'
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

export function SearchBar({ onCitySelect, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Search with debounce
  const handleSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(searchQuery)}`
      )
      const data = await response.json()
      setResults(data.slice(0, 5))
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounced input handler
  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => handleSearch(value), 300)
  }

  // Select a result
  const handleSelect = (result: SearchResult) => {
    const cityName = result.address?.city || 
                     result.address?.town || 
                     result.address?.village || 
                     result.name

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

  // Clear search
  const handleClear = () => {
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }

  // Mobile expand handler
  const handleMobileExpand = () => {
    setIsExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // Handle escape key
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

  return (
    <>
      {/* Desktop Search Bar */}
      <div className="hidden md:block absolute top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative"
        >
          <HudCorners isActive={isFocused}>
            <div className="jarvis-panel rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                {isSearching || isLoading ? (
                  <Loader2 className="h-5 w-5 text-jarvis-cyan animate-spin" />
                ) : (
                  <Search className="h-5 w-5 text-jarvis-cyan" />
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                  placeholder="Search city, location..."
                  className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground 
                           font-mono text-sm outline-none"
                />
                {query && (
                  <button
                    onClick={handleClear}
                    className="text-muted-foreground hover:text-jarvis-cyan transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Results Dropdown */}
              <AnimatePresence>
                {results.length > 0 && isFocused && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border overflow-hidden"
                  >
                    <ul className="py-2">
                      {results.map((result) => (
                        <li key={result.place_id}>
                          <button
                            onClick={() => handleSelect(result)}
                            className="w-full px-4 py-3 flex items-start gap-3 hover:bg-accent 
                                     transition-colors text-left group"
                          >
                            <MapPin className="h-4 w-4 text-jarvis-cyan mt-0.5 shrink-0 
                                            group-hover:scale-110 transition-transform" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {result.address?.city || 
                                 result.address?.town || 
                                 result.address?.village || 
                                 result.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {result.display_name}
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </HudCorners>
        </motion.div>
      </div>

      {/* Mobile Search Button & Expanded View */}
      <div className="md:hidden">
        {!isExpanded ? (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={handleMobileExpand}
            className="fixed top-4 right-4 z-50 h-12 w-12 rounded-full jarvis-panel 
                     flex items-center justify-center jarvis-glow"
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
            <div className="p-4 pt-safe">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => {
                    setIsExpanded(false)
                    setResults([])
                  }}
                  className="text-muted-foreground hover:text-jarvis-cyan"
                >
                  <X className="h-6 w-6" />
                </button>
                <span className="font-mono text-sm text-jarvis-cyan">LOCATION SEARCH</span>
              </div>

              <HudCorners isActive>
                <div className="jarvis-panel rounded-lg">
                  <div className="flex items-center gap-3 p-4">
                    {isSearching ? (
                      <Loader2 className="h-5 w-5 text-jarvis-cyan animate-spin" />
                    ) : (
                      <Search className="h-5 w-5 text-jarvis-cyan" />
                    )}
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => handleInputChange(e.target.value)}
                      placeholder="Search city, location..."
                      className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground 
                               font-mono text-base outline-none"
                      autoFocus
                    />
                    {query && (
                      <button onClick={handleClear} className="text-muted-foreground">
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              </HudCorners>

              {/* Mobile Results */}
              <div className="mt-4 space-y-2">
                {results.map((result) => (
                  <motion.button
                    key={result.place_id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    onClick={() => handleSelect(result)}
                    className="w-full jarvis-panel rounded-lg p-4 flex items-start gap-3 text-left"
                  >
                    <MapPin className="h-5 w-5 text-jarvis-cyan mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {result.address?.city || 
                         result.address?.town || 
                         result.address?.village || 
                         result.name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {result.display_name}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </>
  )
}
