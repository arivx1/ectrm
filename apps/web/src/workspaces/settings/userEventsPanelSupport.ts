import { apiReachabilityMessage } from '../../entities/app/workspaceDataShared'
import { appConfig } from '../../shared/config'

const USER_EVENT_MIGRATION_COMMAND =
  './.venv/bin/alembic -c apps/api/alembic.ini upgrade a4b5c6d7e8fa'

export function formatUserEventSaveError(error: unknown): string {
  const message = apiReachabilityMessage(error)

  if (/could not reach api/i.test(message)) {
    return `${message} Make sure the API is running on ${appConfig.apiDisplayHost}. If you just pulled the custom events backend, restart the API and run ${USER_EVENT_MIGRATION_COMMAND}.`
  }

  if (
    /user_defined_events/i.test(message) &&
    /(no such table|does not exist|undefined table|relation)/i.test(message)
  ) {
    return `Custom events need the latest database migration. Run ${USER_EVENT_MIGRATION_COMMAND}, restart the API if needed, and try again.`
  }

  if (/404/.test(message) || /not found/i.test(message)) {
    return `The running API does not have the custom events endpoint yet. Restart the API on the latest branch and run ${USER_EVENT_MIGRATION_COMMAND}.`
  }

  return message
}
