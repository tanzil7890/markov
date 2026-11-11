import { Marked } from 'marked'

// No allow-same-origin: user HTML runs as an opaque origin and can never reach this server's origin.
export const ARTIFACT_PAGE_CSP =
  'sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads'

const markdown = new Marked({ gfm: true })

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const MARKDOWN_STYLE = `
:root{color-scheme:light dark}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:46rem;margin:0 auto;padding:2rem 1rem}
pre{overflow:auto;padding:.75rem;border-radius:6px;background:rgba(127,127,127,.12)}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
img{max-width:100%}
table{border-collapse:collapse}
th,td{border:1px solid rgba(127,127,127,.4);padding:.25rem .5rem}
blockquote{margin-left:0;padding-left:1rem;border-left:3px solid rgba(127,127,127,.4)}`

// Rendered once at write time so public reads never pay for Markdown parsing.
export function renderArtifactHtml(input: {
  content: string
  contentType: 'text/html' | 'text/markdown'
  title: string | null
  fileName: string
}): string {
  if (input.contentType === 'text/html') return input.content
  const body = markdown.parse(input.content, { async: false })
  const title = escapeHtml(input.title ?? input.fileName)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${MARKDOWN_STYLE}</style></head><body><main>${body}</main></body></html>`
}

export function artifactNotFoundPage(): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found</title></head><body style="font-family:system-ui,sans-serif;margin:4rem auto;max-width:28rem;padding:0 1rem"><h1>Not found</h1><p>This shared page has expired or was removed.</p></body></html>'
}
