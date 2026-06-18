import { useState, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Terminal } from 'lucide-react'

function CopyButton({ text, size = 'sm' }: { text: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 transition-colors ${
        size === 'sm'
          ? 'text-[10px] text-text-muted hover:text-text'
          : 'text-[11px] text-text-muted hover:text-text'
      }`}
      title="Copy code"
      aria-label={copied ? 'Copied to clipboard' : 'Copy code to clipboard'}
    >
      {copied ? (
        <><Check className="w-3 h-3 text-green" /> Copied</>
      ) : (
        <><Copy className="w-3 h-3" /> Copy</>
      )}
    </button>
  )
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeString = String(children).replace(/\n$/, '')
            const isInline = !match && !codeString.includes('\n')
            void props // suppress unused

            if (isInline) {
              return (
                <code className="font-mono text-[0.88em] text-accent bg-accent/8 px-1.5 py-0.5 rounded-md border border-accent/15 break-words">
                  {children}
                </code>
              )
            }

            const language = match ? match[1] : 'text'

            return (
              <div className="my-3 rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2 border-b border-border">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-3 h-3 text-text-muted" />
                    <span className="text-[10px] font-mono text-text-muted tracking-wider">{language}</span>
                  </div>
                  <CopyButton text={codeString} />
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: '0 0 0.5rem 0.5rem',
                    fontSize: '12px',
                    lineHeight: '1.65',
                    background: 'var(--color-surface-2)',
                  }}
                  codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            )
          },
          pre: ({ children }) => <>{children}</>,
          h1: ({ children }) => <h3 className="text-base font-bold text-text mt-4 mb-1.5">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-semibold text-text mt-3.5 mb-1.5">{children}</h4>,
          h3: ({ children }) => <h5 className="text-[13px] font-semibold text-text mt-3 mb-1">{children}</h5>,
          h4: ({ children }) => <h6 className="text-[13px] font-medium text-text-secondary mt-2.5 mb-1">{children}</h6>,
          p: ({ children }) => <p className="my-1.5 text-[13px] text-text-secondary leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="my-2 space-y-1 list-none">{children}</ul>,
          ol: ({ children, start }) => <ol className="my-2 space-y-1.5 list-none" start={start}>{children}</ol>,
          li: ({ children, ...props }) => {
            const ordered = (props as Record<string, unknown>).ordered
            const index = (props as Record<string, unknown>).index as number | undefined
            return (
              <li className="flex items-start gap-2 text-[13px] text-text-secondary leading-relaxed">
                {ordered ? (
                  <span className="mt-[1px] w-5 h-5 rounded-md bg-surface-2 text-text-muted text-[10px] font-bold flex items-center justify-center shrink-0 border border-border">
                    {(index ?? 0) + 1}
                  </span>
                ) : (
                  <span className="mt-[7px] w-1 h-1 rounded-full bg-text-muted shrink-0" />
                )}
                <span className="flex-1">{children}</span>
              </li>
            )
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="text-accent hover:text-accent-hover font-medium underline decoration-accent/30 underline-offset-2 hover:decoration-accent/60 transition-colors"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
          em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent/40 pl-3 my-2 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children }) => (
            <div className="my-3 rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">{children}</table>
              </div>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-text border-b border-border">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[12px] text-text-secondary border-b border-border/50">{children}</td>
          ),
          tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
