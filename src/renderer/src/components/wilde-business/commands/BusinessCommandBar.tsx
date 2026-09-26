import { useId, useState } from 'react'
import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCommandCapture } from './use-command-capture'

type BusinessCommandBarProps = { onCommand: (text: string) => void; scopeKey: string }

export function BusinessCommandBar(props: BusinessCommandBarProps) {
  return <ScopedBusinessCommandBar key={props.scopeKey} {...props} />
}

function ScopedBusinessCommandBar({
  onCommand,
  scopeKey
}: {
  onCommand: (text: string) => void
  scopeKey: string
}) {
  const inputId = useId()
  const hintId = useId()
  const [text, setText] = useState('')
  const capture = useCommandCapture(onCommand, scopeKey)
  return (
    <section aria-label="Business commands" className="space-y-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim()) {
            capture.cancel()
            onCommand(text.trim())
            setText('')
          }
        }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={inputId}>Command</Label>
          <Input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            placeholder="For example: Show failed automations this week"
            aria-describedby={hintId}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!text.trim()}>
          Run command
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label="Hold to speak a business command"
          aria-describedby={hintId}
          aria-pressed={capture.status === 'starting' || capture.status === 'listening'}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return
            }
            event.currentTarget.setPointerCapture?.(event.pointerId)
            void capture.start()
          }}
          onPointerUp={() => capture.release()}
          onPointerCancel={() => capture.cancel()}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault()
              if (!event.repeat) {
                void capture.start()
              }
            }
          }}
          onKeyUp={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault()
              capture.release()
            }
          }}
          onBlur={() => capture.cancel()}
        >
          <Mic aria-hidden="true" />
          {capture.status === 'transcribing' ? 'Transcribing…' : 'Hold to speak'}
        </Button>
      </form>
      <p id={hintId} role="status" className="text-pretty text-sm text-muted-foreground">
        {capture.message}
      </p>
      {capture.partial && <p className="text-pretty text-sm">{capture.partial}</p>}
    </section>
  )
}
