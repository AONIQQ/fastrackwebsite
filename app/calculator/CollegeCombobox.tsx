'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export type CollegeOption = { id: number; name: string; city: string | null }

/**
 * Type-to-filter college picker.
 *
 * The old plain <Select> listed every college in a state with no search — 400+
 * items in CA and NY, scrolled by hand on a phone. This is the single biggest
 * drop-off point in the funnel, so it gets a real combobox.
 */
export function CollegeCombobox({
  options,
  value,
  onChange,
  disabled,
  loading,
  placeholder = 'Select a College',
  emptyLabel = 'No colleges found',
}: {
  options: CollegeOption[]
  value: CollegeOption | null
  onChange: (option: CollegeOption) => void
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  emptyLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    // Prefix matches first — typing "penn" should surface Penn State before
    // "University of Pennsylvania".
    const starts: CollegeOption[] = []
    const contains: CollegeOption[] = []
    for (const o of options) {
      const n = o.name.toLowerCase()
      if (n.startsWith(q)) starts.push(o)
      else if (n.includes(q) || (o.city ?? '').toLowerCase().includes(q)) contains.push(o)
    }
    return [...starts, ...contains]
  }, [options, query])

  useEffect(() => setHighlight(0), [query])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const commit = (o: CollegeOption) => {
    onChange(o)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight]) commit(filtered[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full h-14 px-3 flex items-center justify-between rounded-md border border-[#605dba] bg-[#f0f0f8] text-[#080b53] text-lg disabled:opacity-50 disabled:cursor-not-allowed text-left"
      >
        <span className={value ? 'truncate' : 'truncate text-[#605dba]'}>
          {loading ? 'Loading colleges…' : value ? value.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[#605dba] bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-[#e0e0f0] px-3 py-2">
            <Search className="h-4 w-4 text-[#605dba] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              className="w-full bg-transparent text-[#080b53] outline-none text-base"
              aria-label="Search colleges"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X className="h-4 w-4 text-[#605dba]" />
              </button>
            )}
          </div>

          <ul ref={listRef} role="listbox" className="max-h-[300px] overflow-y-auto py-1">
            {filtered.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={value?.id === o.id}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(o)}
                className={`px-3 py-2 cursor-pointer text-base ${
                  i === highlight ? 'bg-[#605dba] text-white' : 'text-[#080b53]'
                }`}
              >
                <span className="block truncate">{o.name}</span>
                {o.city && (
                  <span className={`block text-xs ${i === highlight ? 'text-white/80' : 'text-[#605dba]'}`}>
                    {o.city}
                  </span>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-base text-[#605dba]">{emptyLabel}</li>
            )}
          </ul>

          {filtered.length > 0 && (
            <div className="border-t border-[#e0e0f0] px-3 py-1.5 text-xs text-[#605dba]">
              {filtered.length.toLocaleString()} of {options.length.toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
