import wildeMark from '../../../../resources/wilde/wilde-mark-64.png'
import wildeMark2x from '../../../../resources/wilde/wilde-mark-128.png'
import { translate } from '@/i18n/i18n'
import { useWildeAppearance } from '../hooks/use-wilde-appearance'

// Why: below this sidebar width the wordmark would push back/forward into the first tab, so
// only the WS mark stays beside the Orca mark.
const WORDMARK_MIN_SIDEBAR_WIDTH = 330

/**
 * The Wilde Systems mark beside the existing Orca mark in the titlebar. Renders nothing unless
 * Wilde is actually painting (enabled and resolved dark), so "off" and light mode stay stock.
 * Deliberately non-interactive: it stays part of the titlebar drag region.
 */
export function WildeBrandLockup({
  sidebarWidth,
  isFloating
}: {
  sidebarWidth: number
  isFloating: boolean
}): React.JSX.Element | null {
  const { active } = useWildeAppearance()
  if (!active) {
    return null
  }
  const showWordmark = !isFloating && sidebarWidth >= WORDMARK_MIN_SIDEBAR_WIDTH
  return (
    <div
      data-wilde-brand-lockup=""
      className="wilde-brand-lockup"
      role="img"
      aria-label={translate('app.wildeBrand.label', 'Wilde Systems, customized Orca edition')}
    >
      <span className="wilde-brand-lockup-divider" aria-hidden />
      <img
        src={wildeMark}
        srcSet={`${wildeMark} 1x, ${wildeMark2x} 2x`}
        alt=""
        aria-hidden
        className="wilde-brand-lockup-mark"
      />
      {showWordmark ? (
        <span className="wilde-brand-lockup-text" aria-hidden>
          <span className="wilde-brand-lockup-name">
            {translate('app.wildeBrand.name', 'Wilde Systems')}
          </span>
          <span className="wilde-brand-lockup-edition">
            {translate('app.wildeBrand.edition', 'Customized Orca edition')}
          </span>
        </span>
      ) : null}
    </div>
  )
}
