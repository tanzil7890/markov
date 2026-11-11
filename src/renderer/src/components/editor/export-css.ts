// Export needs paper layouts without sticky chrome or hover affordances; keep it independent of live app styles.
export const EXPORT_CSS = `
* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #1f2328;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial,
    sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  font-size: 14px;
  line-height: 1.6;
}

.markov-export-root {
  padding: 0;
  max-width: 100%;
}

.markov-export-root h1,
.markov-export-root h2,
.markov-export-root h3,
.markov-export-root h4,
.markov-export-root h5,
.markov-export-root h6 {
  font-weight: 600;
  line-height: 1.25;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.markov-export-root h1 { font-size: 1.9em; }
.markov-export-root h2 { font-size: 1.5em; }
.markov-export-root h3 { font-size: 1.25em; }
.markov-export-root h4 { font-size: 1em; }

.markov-export-root p,
.markov-export-root blockquote,
.markov-export-root ul,
.markov-export-root ol,
.markov-export-root pre,
.markov-export-root table {
  margin-top: 0;
  margin-bottom: 1em;
}

.markov-export-root a {
  color: #0969da;
  text-decoration: underline;
}

.markov-export-root blockquote {
  padding: 0 1em;
  color: #57606a;
  border-left: 0.25em solid #d0d7de;
}

.markov-export-root [data-callout] {
  margin: 0 0 1em;
  padding: 0 1em;
  border-left: 0.25em solid var(--callout);
}

.markov-export-root [data-callout] > :first-child {
  display: flex;
  align-items: center;
  gap: 0.4em;
  margin-bottom: 0.25em;
  color: var(--callout);
  font-weight: 600;
}

.markov-export-root [data-callout] > :first-child svg { width: 1em; height: 1em; }

.markov-export-root [data-callout="note"] { --callout: #0969da; }
.markov-export-root [data-callout="tip"] { --callout: #1a7f37; }
.markov-export-root [data-callout="important"] { --callout: #8250df; }
.markov-export-root [data-callout="warning"] { --callout: #9a6700; }
.markov-export-root [data-callout="caution"] { --callout: #cf222e; }

.markov-export-root code,
.markov-export-root pre {
  font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
}

.markov-export-root code {
  background: #f6f8fa;
  padding: 0.2em 0.4em;
  border-radius: 4px;
}

.markov-export-root pre {
  background: #f6f8fa;
  padding: 12px 16px;
  border-radius: 6px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.markov-export-root pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.markov-export-root table {
  border-collapse: collapse;
  width: 100%;
}

.markov-export-root th,
.markov-export-root td {
  border: 1px solid #d0d7de;
  padding: 6px 12px;
  text-align: left;
}

.markov-export-root th { background: #f6f8fa; }

.markov-export-root img,
.markov-export-root svg {
  max-width: 100%;
  height: auto;
}

.markov-export-root ul,
.markov-export-root ol { padding-left: 2em; }

.markov-export-root li { margin: 0.25em 0; }

.markov-export-root input[type="checkbox"] {
  margin-right: 0.4em;
}

.markov-export-root hr {
  border: 0;
  border-top: 1px solid #d0d7de;
  margin: 1.5em 0;
}

/* Why: the export subtree selection already excludes the big chrome (toolbar,
   search bar, etc.), but in-document affordances like the code-copy button
   and preview annotation controls can still leak. Hide the well-known
   offenders as a belt-and-suspenders defense on top of DOM scrubbing. */
.code-block-copy-btn,
.markdown-preview-search,
.markdown-annotation-controls,
.rich-markdown-toolbar,
[data-markov-export-hide] {
  display: none !important;
}

.code-block-wrapper { position: static !important; }

@media print {
  pre, code, table, img, svg { page-break-inside: avoid; }
  h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
}
`
