import React from 'react'

/** Monochrome outline of the Google Drive mark, drawn like the lucide activity-bar icons. */
export function GoogleDriveIcon({
  size = 16,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* The Drive triangle's three strokes: left, bottom and right. */}
      <path d="M12 10l-6 10l-3 -5l6 -10z" />
      <path d="M9 15h12l-3 5h-12" />
      <path d="M15 15l-6 -10h6l6 10z" />
    </svg>
  )
}
