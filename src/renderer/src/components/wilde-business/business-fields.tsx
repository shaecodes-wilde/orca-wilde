import { useId, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export function TextField({
  label,
  name,
  value = '',
  multiline = false,
  required = false,
  type = 'text'
}: {
  label: string
  name: string
  value?: string
  multiline?: boolean
  required?: boolean
  type?: string
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          name={name}
          defaultValue={value}
          required={required}
          rows={5}
          maxLength={32000}
        />
      ) : (
        <Input
          id={id}
          name={name}
          defaultValue={value}
          required={required}
          type={type}
          maxLength={2048}
        />
      )}
    </div>
  )
}

export function Choice({
  label,
  name,
  value,
  options,
  onChange,
  disabled
}: {
  label: string
  name?: string
  value: string
  options: { value: string; label: string }[]
  onChange?: (value: string) => void
  disabled?: boolean
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        name={name}
        defaultValue={onChange ? undefined : value}
        value={onChange ? value : undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function choices(values: readonly string[]): { value: string; label: string }[] {
  return values.map((value) => ({ value, label: value.replaceAll('-', ' ') }))
}

export function EmptyState({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="py-8 text-sm text-pretty text-muted-foreground">{children}</p>
}

export function timestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}
