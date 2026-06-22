import { useEffect, useState } from 'react'

// Sticky in-page jump-rail for the single-scroll project detail. Clicking scrolls
// to the section; a scroll-spy (IntersectionObserver) highlights the section in
// view. The "less is more" alternative to tabs — one panel, easy navigation.
export default function ProjectAnchorNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.25, 0.5] },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sections])

  const go = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <nav className="sticky top-4 space-y-0.5">
      {sections.map((s) => (
        <button key={s.id} onClick={() => go(s.id)}
          className={`w-full text-left px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
            active === s.id ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text hover:bg-text-muted/5'}`}>
          {s.label}
        </button>
      ))}
    </nav>
  )
}
