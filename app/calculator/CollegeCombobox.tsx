'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export type CollegeOption = { id: number; name: string; city: string | null }

/**
 * Type-to-filter college picker.
 *
 * The old plain <Select> listed every college in a state with no search, 400+
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
  labelId,
  onActionReady,
}: {
  options: CollegeOption[]
  value: CollegeOption | null
  onChange: (option: CollegeOption) => void
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  emptyLabel?: string
  labelId: string
  onActionReady?: (action: HTMLButtonElement | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const wasOpenRef = useRef(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    // Prefix matches first, typing "penn" should surface Penn State before
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
    if (open) {
      inputRef.current?.focus()
      wasOpenRef.current = true
    } else {
      setQuery('')
      if (wasOpenRef.current) {
        wasOpenRef.current = false
        triggerRef.current?.focus()
      }
    }
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
        ref={(node) => {
          triggerRef.current = node
          onActionReady?.(node)
        }}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} college-trigger-value`}
        className="flex h-12 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-base text-[#080b53] transition-shadow focus:outline-none focus:ring-2 focus:ring-[#605dba]/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span id="college-trigger-value" className={value ? 'truncate' : 'truncate text-slate-400'}>
          {loading ? 'Loading colleges…' : value ? value.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              className="w-full bg-transparent text-base text-[#080b53] outline-none placeholder:text-slate-400"
              aria-labelledby={labelId}
              aria-controls="college-options"
              aria-expanded="true"
              aria-required="true"
              aria-autocomplete="list"
              aria-activedescendant={filtered[highlight] ? `college-option-${filtered[highlight].id}` : undefined}
              role="combobox"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear college search" className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center">
                <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          <ul id="college-options" ref={listRef} role="listbox" aria-labelledby={labelId} className="max-h-[300px] overflow-y-auto py-1">
            {filtered.map((o, i) => (
              <li
                key={o.id}
                id={`college-option-${o.id}`}
                role="option"
                aria-selected={value?.id === o.id}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(o)}
                className={`cursor-pointer px-3 py-2.5 text-base ${
                  i === highlight ? 'bg-[#605dba] text-white' : 'text-[#080b53]'
                }`}
              >
                <span className="block truncate">{o.name}</span>
                {o.city && (
                  <span className={`block text-xs ${i === highlight ? 'text-white/75' : 'text-slate-500'}`}>
                    {o.city}
                  </span>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-base text-slate-500">{emptyLabel}</li>
            )}
          </ul>

          {filtered.length > 0 && (
            <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
              {filtered.length.toLocaleString()} of {options.length.toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
