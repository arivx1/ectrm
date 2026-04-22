import type { DocumentationDocumentKey } from '../../workspaces/docs/DocumentationWorkspace'
import type { ViewKey } from '../../shared/models'
import {
  APP_VIEWS,
  HERO_BODY_BY_VIEW,
  HERO_TITLE_BY_VIEW,
  workspaceLabel,
} from './workspaceRegistry'

export { APP_VIEWS, HERO_BODY_BY_VIEW, HERO_TITLE_BY_VIEW, workspaceLabel }

export const DEFAULT_DOCUMENTATION_DOCUMENT_KEY: DocumentationDocumentKey = 'guide'

const VIEW_KEYS = new Set<ViewKey>(APP_VIEWS.map((view) => view.key))

export function isViewKey(value: string | null): value is ViewKey {
  return value !== null && VIEW_KEYS.has(value as ViewKey)
}

export function isDocumentationDocumentKey(value: string | null): value is DocumentationDocumentKey {
  return value === 'guide' || value === 'roadmap'
}
