import React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GoogleDriveIcon } from './google-drive-icon'

export function DriveEmptyState({
  title,
  body,
  action,
  onAction,
  secondaryAction,
  onSecondaryAction
}: {
  title: string
  body: string
  action: string
  onAction: () => void
  secondaryAction?: string
  onSecondaryAction?: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <GoogleDriveIcon size={28} className="text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] break-words text-muted-foreground">{body}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onAction}>
          {action}
        </Button>
        {secondaryAction && onSecondaryAction ? (
          <Button size="sm" variant="outline" onClick={onSecondaryAction}>
            {secondaryAction}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function DriveToolbarButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
