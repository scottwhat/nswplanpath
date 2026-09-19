import { titleCaseAddress, type AddressSuggestion } from '@planpath/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { MIN_QUERY_LENGTH, suggestAddresses } from '../lib/addresses'
import { useSelectedSite } from '../lib/selectedSite'
import { useSiteStore } from '../stores/useSiteStore'

/**
 * Address combobox over the NSW address point layer. The map only ever moves
 * for an address the user picked from this list, so it always corresponds to a
 * real addressable point rather than a fuzzy text match.
 */
export function AddressSearch() {
  const setAddress = useSiteStore((state) => state.setAddress)
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const { lotLabel, addressLabel } = useSelectedSite()

  // A lot clicked on the map replaces the searched address, so the box follows
  // it: the lot's own address once it resolves, blank if it has none.
  useEffect(() => {
    if (lotLabel) setValue(addressLabel ?? '')
  }, [lotLabel, addressLabel])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 220)
    return () => clearTimeout(timer)
  }, [value])

  const suggestions = useQuery({
    queryKey: ['address-suggest', debounced],
    queryFn: ({ signal }) => suggestAddresses(debounced, signal),
    enabled: debounced.trim().length >= MIN_QUERY_LENGTH,
    staleTime: 10 * 60 * 1000,
  })

  const options = suggestions.data ?? []

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function choose(suggestion: AddressSuggestion) {
    setAddress(suggestion)
    setValue(titleCaseAddress(suggestion.address))
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (options.length === 0) return
      setOpen(true)
      setActiveIndex((index) => {
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1
        return (next + options.length) % options.length
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      // Enter picks the highlighted row, or the only unambiguous match.
      const choice = options[activeIndex] ?? (options.length === 1 ? options[0] : null)
      if (choice) choose(choice)
    }
  }

  const typed = value.trim()
  const noMatches =
    !suggestions.isFetching &&
    typed.length >= MIN_QUERY_LENGTH &&
    debounced.trim().length >= MIN_QUERY_LENGTH &&
    options.length === 0

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="group relative">
        {/* Target marker. z-10 because the input's backdrop-blur makes it a
            stacking context that would otherwise paint over this. */}
        <span
          className="pointer-events-none absolute left-4 top-1/2 z-10 grid h-3 w-3 -translate-y-1/2 place-items-center"
          aria-hidden="true"
        >
          <span className="absolute inset-0 rounded-full border border-beam-700/60" />
          <span className="h-1 w-1 rounded-full bg-beam-700" />
        </span>
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder="Start typing a NSW address, e.g. 12 Smith Street Marrickville"
          aria-label="NSW address"
          className="peer w-full rounded-[4px] border border-navy-300 bg-white/90 py-3.5 pl-11 pr-28 text-sm text-navy-990 shadow-sm outline-none backdrop-blur-md transition placeholder:text-navy-500 focus:border-beam-600 focus:shadow-[0_0_0_3px_rgb(6_182_212/0.18)]"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px origin-left scale-x-0 bg-gradient-to-r from-beam-600 via-beam-600/50 to-transparent transition-transform duration-300 peer-focus:scale-x-100" />
        {suggestions.isFetching && (
          <span className="readout pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2">
            Scanning
          </span>
        )}
      </div>

      {open && options.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="panel absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto py-1"
        >
          {options.map((suggestion, index) => (
            <li
              key={suggestion.gurasid}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onPointerDown={(event) => {
                event.preventDefault()
                choose(suggestion)
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-center gap-3 border-l-2 px-4 py-2.5 text-sm transition ${
                index === activeIndex
                  ? 'border-beam-600 bg-beam-500/10 text-navy-990'
                  : 'border-transparent text-navy-800'
              }`}
            >
              <span
                className={`h-1 w-1 rounded-full transition ${
                  index === activeIndex ? 'bg-beam-600' : 'bg-navy-300'
                }`}
                aria-hidden="true"
              />
              {titleCaseAddress(suggestion.address)}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 min-h-4 font-mono text-[10px] uppercase tracking-[0.18em]" aria-live="polite">
        {suggestions.error ? (
          <span className="text-signal-600">
            Address lookup failed — {(suggestions.error as Error).message}
          </span>
        ) : noMatches ? (
          <span className="text-signal-600">
            No NSW address starts with that · type number, street, then suburb
          </span>
        ) : null}
      </p>
    </div>
  )
}
