import type { useReferenceDataController } from '../../features/reference-data/useReferenceDataController'
import { ReferenceTabButton } from './ReferenceDataShared'
import { REFERENCE_TAB_ORDER } from './referenceDataTabShared'
import { REFERENCE_TAB_DEFINITIONS } from './referenceDataTabs'

type ReferenceDataWorkspaceProps = {
  controller: ReturnType<typeof useReferenceDataController>
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
}

export function ReferenceDataWorkspace(props: ReferenceDataWorkspaceProps) {
  const { controller, formatCommodityClass, formatDate } = props
  const {
    referenceTab,
    setReferenceTab,
    referenceSearch,
    setReferenceSearch,
    referenceActionError,
    referenceActionSuccess,
  } = controller

  const activeTab = REFERENCE_TAB_DEFINITIONS[referenceTab]
  const Directory = activeTab.Directory
  const Editor = activeTab.Editor
  const Toolbar = activeTab.Toolbar
  const tabProps = { controller, formatCommodityClass, formatDate }

  return (
    <div className="reference-workspace">
      <section className="surface reference-directory">
        <div className="section-head section-head-control">
          <div>
            <span className="eyebrow">Directory</span>
            <h3>Reference Directory</h3>
          </div>
          <div className="toolbar">
            <input
              className="control control-compact"
              value={referenceSearch}
              onChange={(event) => setReferenceSearch(event.target.value)}
              placeholder="Search codes or names"
            />
            {Toolbar ? <Toolbar {...tabProps} /> : null}
          </div>
        </div>

        <div className="tab-row">
          {REFERENCE_TAB_ORDER.map((tab) => {
            const definition = REFERENCE_TAB_DEFINITIONS[tab]
            return (
              <ReferenceTabButton
                key={tab}
                label={definition.label}
                active={referenceTab === tab}
                tooltip={definition.tooltip}
                onClick={() => setReferenceTab(tab)}
              />
            )
          })}
        </div>

        <Directory {...tabProps} />
      </section>

      <aside className="surface reference-editor">
        <div className="section-head">
          <div>
            <span className="eyebrow">Maintenance</span>
            <h3>{activeTab.editorTitle}</h3>
          </div>
          <p>Maintain master data directly in the app, including activation controls and basic audit context.</p>
        </div>

        {referenceActionError && <div className="error-banner reference-banner">{referenceActionError}</div>}
        {referenceActionSuccess && <div className="success-banner">{referenceActionSuccess}</div>}

        <Editor {...tabProps} />
      </aside>
    </div>
  )
}
