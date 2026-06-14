import type { ViewKey } from '../../shared/models'
import {
  APP_VIEWS,
  HERO_BODY_BY_VIEW,
  HERO_TITLE_BY_VIEW,
  workspaceLabel,
} from './workspaceRegistry'

export { APP_VIEWS, HERO_BODY_BY_VIEW, HERO_TITLE_BY_VIEW, workspaceLabel }

const VIEW_KEYS = new Set<ViewKey>(APP_VIEWS.map((view) => view.key))

export function isViewKey(value: string | null): value is ViewKey {
  return value !== null && VIEW_KEYS.has(value as ViewKey)
}
