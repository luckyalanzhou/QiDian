export type HeadingObserverHandle = Pick<IntersectionObserver, 'observe' | 'disconnect'>;
export type HeadingObserverFactory = (
  callback: IntersectionObserverCallback,
  options: IntersectionObserverInit
) => HeadingObserverHandle;

export function mountHeadingObserver(
  headings: readonly HTMLElement[],
  links: readonly HTMLAnchorElement[],
  onCurrentSection: (id: string) => void = () => undefined,
  createObserver: HeadingObserverFactory | null = typeof IntersectionObserver === 'undefined'
    ? null
    : (callback, options) => new IntersectionObserver(callback, options)
) {
  if (!headings.length) return () => undefined;

  const updateCurrent = (id: string) => {
    onCurrentSection(id);
    for (const link of links) {
      const current = link.hash === `#${id}`;
      link.classList.toggle('current', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };

  updateCurrent(headings[0].id);
  if (!createObserver) return () => undefined;

  const observer = createObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
    if (visible) updateCurrent((visible.target as HTMLElement).id);
  }, { rootMargin: '-14% 0px -74% 0px', threshold: 0 });

  headings.forEach(heading => observer.observe(heading));
  return () => observer.disconnect();
}
