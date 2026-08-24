'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Inline combobox: lets the user pick from existing types OR type a custom one.
// Used for both Supplier "Type" and Vendor "Type" — both should support custom types.
export function TypeCombo({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  // If the current value isn't in the predefined options, default to custom mode.
  // Computed once at init (no useEffect → no lint warning about setState in effect).
  const [custom, setCustom] = useState(() => Boolean(value) && !options.includes(value))
  if (custom) {
    return (
      <div className="flex gap-1">
        <Input
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-muted/50 border-border"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { setCustom(false); onChange(options[0] || '') }}
          className="h-9 px-2 text-xs shrink-0"
          title="Switch back to dropdown"
        >
          ▾
        </Button>
      </div>
    )
  }
  return (
    <div className="flex gap-1">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-muted/50 border-border flex-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
          {/* Show custom-typed value if it's not in the predefined list */}
          {value && !options.includes(value) && (
            <SelectItem value={value}>{value} (custom)</SelectItem>
          )}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setCustom(true)}
        className="h-9 px-2 text-xs shrink-0"
        title="Add a custom type"
      >
        + Custom
      </Button>
    </div>
  )
}
