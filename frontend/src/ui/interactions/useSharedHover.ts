import { useCallback } from 'react';
import { useUi } from '@/store/ui';

/** Shared hover: hovering or focusing an element for a state highlights that state in every component
 *  (map, bar, table row, scatter point, insight card). Spread `bind` onto the element. */
export function useSharedHover(code: string | null | undefined) {
  const hovered = useUi((s) => s.hovered);
  const setHovered = useUi((s) => s.setHovered);
  const on = useCallback(() => { if (code) setHovered(code); }, [code, setHovered]);
  const off = useCallback(() => { if (code && useUi.getState().hovered === code) setHovered(null); }, [code, setHovered]);
  return {
    highlighted: !!code && hovered === code,
    /** another state is hovered somewhere: charts dim this one */
    dimmed: !!code && hovered != null && hovered !== code,
    bind: { onMouseEnter: on, onMouseLeave: off, onFocus: on, onBlur: off },
  };
}
