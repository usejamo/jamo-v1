import React from 'react'

// The chat model emits **bold** for emphasis (e.g. section names). Split on
// matched **...** pairs — with one capture group, String.split yields
// [plain, bold, plain, bold, ...], so odd indices are the bold content.
// An unmatched ** never matches the pair pattern, so it just renders literally.
const BOLD_PATTERN = /\*\*(.+?)\*\*/g

/** Renders **bold** segments in chat text as <strong>; everything else is plain. */
export function InlineMarkdown({ text }: { text: string }): React.ReactElement {
  const parts = text.split(BOLD_PATTERN)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i}>{part}</strong>
          : <React.Fragment key={i}>{part}</React.Fragment>,
      )}
    </>
  )
}
