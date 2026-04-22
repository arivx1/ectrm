import { ASSISTANT_ACTION_TYPES, type AssistantActionDefinition, type AssistantActionType } from '../../shared/models'

export type AssistantActionDefinitionMap = ReadonlyMap<string, AssistantActionDefinition>

function fallbackActionLabel(actionType: string): string {
  return actionType.replace(/_/g, ' ')
}

export function normalizeAssistantActionDefinitions(
  definitions: readonly AssistantActionDefinition[] | null | undefined,
): AssistantActionDefinition[] {
  const seen = new Set<string>()
  const normalized: AssistantActionDefinition[] = []

  for (const definition of definitions ?? []) {
    if (seen.has(definition.name)) {
      continue
    }
    seen.add(definition.name)
    normalized.push(definition)
  }

  return normalized
}

export function buildAssistantActionDefinitionMap(
  definitions: readonly AssistantActionDefinition[] | null | undefined,
): Map<string, AssistantActionDefinition> {
  return new Map(
    normalizeAssistantActionDefinitions(definitions).map((definition) => [definition.name, definition]),
  )
}

export function assistantActionTypeOptions(
  definitions: readonly AssistantActionDefinition[] | null | undefined,
): AssistantActionType[] {
  const catalogNames = normalizeAssistantActionDefinitions(definitions).map((definition) => definition.name)
  return catalogNames.length > 0 ? catalogNames : [...ASSISTANT_ACTION_TYPES]
}

export function formatAssistantActionTypeLabel(
  actionType: string,
  definitionsByName?: AssistantActionDefinitionMap,
): string {
  return definitionsByName?.get(actionType)?.label.trim() || fallbackActionLabel(actionType)
}
