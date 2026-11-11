import { escapeHtml } from './artifact-page.js'
import type { SkillCloudVersion } from './skill-cloud-contract.js'

export const SKILL_SHARE_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

const STYLE = `
:root{color-scheme:light dark}
body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:34rem;margin:4rem auto;padding:0 1rem}
h1{font-size:1.5rem;margin:0 0 .25rem}
p{margin:.5rem 0}
.muted{opacity:.7}
ul{padding-left:1.25rem}
a.open{display:inline-block;margin:1rem 0 .5rem;padding:.6rem 1.1rem;border-radius:6px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600}`

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`
}

export function skillSharePage(shareId: string, version: SkillCloudVersion): string {
  const skills = version.manifest.skills
    .map((skill) => `<li>${escapeHtml(skill.name)}</li>`)
    .join('')
  const description = version.description ? `<p>${escapeHtml(version.description)}</p>` : ''
  return page(
    `${version.name} · Markov skills`,
    `<p class="muted">Shared Markov skills</p><h1>${escapeHtml(version.name)}</h1>${description}<ul>${skills}</ul>` +
      `<a class="open" href="markov://skills/share/${encodeURIComponent(shareId)}">Open in Markov</a>` +
      '<p class="muted">Or copy this link and paste it in Markov → Skills → Install</p>'
  )
}

export function skillShareNotFoundPage(): string {
  return page(
    'Share not found',
    '<h1>Share not found</h1><p>This skill share link is invalid or has been revoked.</p>'
  )
}
