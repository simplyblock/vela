import { useState } from 'react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { useProjectPostgrestConfigQuery } from 'data/config/project-postgrest-config-query'
import { generateTypes } from 'data/projects/project-type-generation-query'
import { Download } from 'lucide-react'
import { Button } from 'ui'
import ContentSnippet from '../ContentSnippet'
import { DOCS_CONTENT } from '../ProjectAPIDocs.constants'
import type { ContentProps } from './Content.types'
import { useSelectedBranchQuery } from 'data/branches/selected-branch-query'

const Entities = ({ language }: ContentProps) => {
  const { slug, ref } = useParams()
  const { data: branch } = useSelectedBranchQuery()
  const [isGeneratingTypes, setIsGeneratingTypes] = useState(false)

  const { data: config } = useProjectPostgrestConfigQuery({ branch })

  const onClickGenerateTypes = async () => {
    try {
      setIsGeneratingTypes(true)
      const res = await generateTypes({ slug, ref, branch: branch?.id, included_schemas: config?.db_schema })
      let element = document.createElement('a')
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(res.types))
      element.setAttribute('download', 'supabase.ts')
      element.style.display = 'none'
      document.body.appendChild(element)
      element.click()
      document.body.removeChild(element)
      toast.success(`Successfully generated types! File is being downloaded`)
    } catch (error: any) {
      toast.error(`Failed to generate types: ${error.message}`)
    } finally {
      setIsGeneratingTypes(false)
    }
  }

  return (
    <>
      <ContentSnippet selectedLanguage={language} snippet={DOCS_CONTENT.entitiesIntroduction} />
      <div>
        <ContentSnippet selectedLanguage={language} snippet={DOCS_CONTENT.generatingTypes} />
        <div className="flex items-center gap-x-2 px-4 mt-3">
          <Button
            type="default"
            disabled={isGeneratingTypes}
            loading={isGeneratingTypes}
            icon={<Download strokeWidth={1.5} />}
            onClick={onClickGenerateTypes}
          >
            Generate and download types
          </Button>
        </div>
        <p className="text-xs text-foreground-light px-4 mt-2">
          Remember to re-generate and download this file as you make changes to your tables.
        </p>
      </div>
      <ContentSnippet selectedLanguage={language} snippet={DOCS_CONTENT.graphql} />
    </>
  )
}

export default Entities
