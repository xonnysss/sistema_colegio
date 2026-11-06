'use client';
import { useCallback, useEffect, useRef, useState, useId } from 'react';

export type ComboboxOption = {
  value: string | number;
  label: string;
  sublabel?: string;
  raw?: unknown;
};

interface ComboboxProps {
  id?: string;
  label?: string;
  placeholder?: string;
  value?: string | number | null;
  onChange?: (value: string | number | null, option?: ComboboxOption | null) => void;
  options?: ComboboxOption[];
  onSearch?: (query: string) => Promise<ComboboxOption[]>;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  className?: string;
}

export function Combobox({
  id: customId,
  label,
  placeholder = 'Buscar o seleccionar…',
  value,
  onChange,
  options = [],
  onSearch,
  disabled = false,
  required = false,
  error,
  className = '',
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = customId || `combobox-${generatedId}`;
  const listboxId = `listbox-${generatedId}`;

  const isRemote = typeof onSearch === 'function';

  // Selected option
  const selectedOption = isRemote
    ? null
    : options.find((o) => String(o.value) === String(value)) ?? null;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remoteOptions, setRemoteOptions] = useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync displayed query with current value when closed
  useEffect(() => {
    if (!isOpen) {
      if (selectedOption) {
        setQuery(selectedOption.label);
      } else if (value && isRemote) {
        // If remote and we only have value, keep query or don't wipe it
      } else if (!value) {
        setQuery('');
      }
    }
  }, [value, selectedOption, isOpen, isRemote]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
        if (selectedOption) {
          setQuery(selectedOption.label);
        } else if (!value) {
          setQuery('');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedOption, value]);

  // Remote search with 250ms debounce
  useEffect(() => {
    if (!isRemote) return;
    if (!isOpen) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemoteOptions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await onSearch(trimmed);
        setRemoteOptions(results.slice(0, 20));
      } catch (err) {
        console.error('Combobox search error:', err);
        setRemoteOptions([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, isRemote, isOpen, onSearch]);

  // Local filtered options
  const displayOptions = isRemote
    ? remoteOptions
    : options
        .filter((o) => {
          if (!query.trim()) return true;
          const q = query.toLowerCase();
          const matchLabel = o.label.toLowerCase().includes(q);
          const matchSub = o.sublabel ? o.sublabel.toLowerCase().includes(q) : false;
          return matchLabel || matchSub;
        })
        .slice(0, 20);

  const handleSelect = useCallback(
    (opt: ComboboxOption) => {
      onChange?.(opt.value, opt);
      setQuery(opt.label);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(null, null);
      setQuery('');
      setActiveIndex(-1);
      if (inputRef.current) inputRef.current.focus();
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      if (selectedOption) setQuery(selectedOption.label);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (displayOptions.length === 0) return;
      setActiveIndex((prev) => {
        const next = prev < displayOptions.length - 1 ? prev + 1 : 0;
        scrollIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (displayOptions.length === 0) return;
      setActiveIndex((prev) => {
        const next = prev > 0 ? prev - 1 : displayOptions.length - 1;
        scrollIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < displayOptions.length) {
        e.preventDefault();
        handleSelect(displayOptions[activeIndex]);
      }
    }
  };

  const scrollIntoView = (index: number) => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('li[role="option"]');
      if (items[index]) {
        items[index].scrollIntoView({ block: 'nearest' });
      }
    }
  };

  return (
    <div className={`combobox-container ${className}`} ref={containerRef} style={{ position: 'relative' }}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: '.84rem' }}>
          {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}

      <div
        className="combobox-input-wrapper"
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          width: '100%',
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 && displayOptions[activeIndex]
              ? `${inputId}-opt-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            paddingRight: value ? 52 : 30,
            border: error ? '1px solid var(--danger)' : undefined,
          }}
        />

        <div
          style={{
            position: 'absolute',
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {Boolean(value) && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              title="Borrar selección"
              aria-label="Borrar selección"
              tabIndex={-1}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '0 4px',
                fontSize: '1rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              if (!disabled) {
                setIsOpen((prev) => !prev);
                inputRef.current?.focus();
              }
            }}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '0 2px',
              fontSize: '.65rem',
              lineHeight: 1,
            }}
            aria-label="Desplegar opciones"
          >
            {isOpen ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {error && <span style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: 3 }}>{error}</span>}

      {isOpen && !disabled && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            maxHeight: 260,
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
            marginTop: 4,
            padding: 4,
            listStyle: 'none',
          }}
        >
          {isRemote && query.trim().length < 2 ? (
            <li
              style={{
                padding: '8px 12px',
                fontSize: '.82rem',
                color: 'var(--muted)',
                fontStyle: 'italic',
              }}
            >
              Escribe al menos 2 letras…
            </li>
          ) : isLoading ? (
            <li
              style={{
                padding: '8px 12px',
                fontSize: '.82rem',
                color: 'var(--muted)',
                fontStyle: 'italic',
              }}
            >
              Buscando…
            </li>
          ) : displayOptions.length === 0 ? (
            <li
              style={{
                padding: '8px 12px',
                fontSize: '.82rem',
                color: 'var(--muted)',
                fontStyle: 'italic',
              }}
            >
              Sin resultados
            </li>
          ) : (
            displayOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              const isHighlighted = idx === activeIndex;

              return (
                <li
                  key={`${opt.value}-${idx}`}
                  id={`${inputId}-opt-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    // Prevent blur before selection
                    e.preventDefault();
                    handleSelect(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '.84rem',
                    background: isHighlighted
                      ? '#e8f2f5'
                      : isSelected
                      ? '#f1f8f9'
                      : 'transparent',
                    color: 'var(--ink)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontWeight: isSelected ? 700 : 500 }}>
                    {opt.label}
                  </span>
                  {opt.sublabel && (
                    <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>
                      {opt.sublabel}
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
