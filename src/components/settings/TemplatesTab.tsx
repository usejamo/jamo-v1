import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Trash2, ChevronDown, ChevronUp, Upload, AlertTriangle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ParseStatus = 'pending' | 'extracting' | 'ready' | 'error'
type TemplateSource = 'prebuilt' | 'uploaded'

interface Template {
  id: string
  name: string
  description: string | null
  source: TemplateSource
  parse_status: ParseStatus
  low_confidence: boolean
  file_path: string | null
  created_at: string
  org_id: string | null
}

interface TemplateSection {
  id: string
  name: string
  role: string | null
  position: number
}

// ── Status indicator ──────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: ParseStatus }) {
  if (status === 'pending' || status === 'extracting') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-blue-600" aria-live="polite">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
        Processing
      </span>
    )
  }
  if (status === 'ready') {
    return <span className="text-sm text-green-600">Ready</span>
  }
  return <span className="text-sm text-red-600">Extraction failed</span>
}

// ── Section disclosure ────────────────────────────────────────────────────────

function SectionDisclosure({
  templateId,
  lowConfidence,
}: {
  templateId: string
  lowConfidence: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [sections, setSections] = useState<TemplateSection[]>([])
  const [loading, setLoading] = useState(false)

  async function loadSections() {
    if (sections.length > 0) return
    setLoading(true)
    const { data } = await supabase
      .from('template_sections')
      .select('id, name, role, position')
      .eq('template_id', templateId)
      .order('position', { ascending: true })
    if (data) setSections(data)
    setLoading(false)
  }

  function toggle() {
    if (!expanded) loadSections()
    setExpanded(prev => !prev)
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        {expanded ? (
          <>Hide sections <ChevronUp className="w-3.5 h-3.5" /></>
        ) : (
          <>View detected sections ({sections.length > 0 ? sections.length : '…'}) <ChevronDown className="w-3.5 h-3.5" /></>
        )}
      </button>

      {expanded && (
        <div className="mt-2">
          {lowConfidence && (
            <div
              role="alert"
              className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-amber-700 mb-2 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Fewer sections than expected were detected — review before using this template.
            </div>
          )}
          {loading ? (
            <p className="text-sm text-gray-400 italic ml-2">Loading sections…</p>
          ) : sections.length === 0 ? (
            <p className="text-sm text-gray-400 italic ml-2">No sections detected.</p>
          ) : (
            <ol className="mt-2 ml-4 space-y-1 list-decimal text-sm text-gray-600">
              {sections.map(s => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

// ── Delete confirmation dialog ────────────────────────────────────────────────

function DeleteDialog({
  templateName,
  onConfirm,
  onCancel,
}: {
  templateName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900 mb-2">Delete template?</h2>
        <p className="text-sm text-gray-600 mb-6">
          This template may have been used in existing proposals. Deleting it will not affect those
          proposals, but it will no longer be available for selection.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TemplatesTab ──────────────────────────────────────────────────────────────

export function TemplatesTab() {
  const { profile } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchTemplates() {
    const { data } = await supabase
      .from('templates')
      .select('id, name, description, source, parse_status, low_confidence, file_path, created_at, org_id')
      .order('source', { ascending: true })
      .order('name', { ascending: true })
    if (data) setTemplates(data as Template[])
    setLoading(false)
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  // Poll when any template is pending/extracting
  useEffect(() => {
    const hasProcessing = templates.some(
      t => t.parse_status === 'pending' || t.parse_status === 'extracting'
    )

    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(fetchTemplates, 3000)
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [templates])

  async function handleFileUpload(file: File) {
    if (!profile?.org_id) return
    if (!file.name.match(/\.(docx|pdf)$/i)) return

    setUploading(true)
    try {
      const newTemplateId = crypto.randomUUID()
      const ext = file.name.split('.').pop()?.toLowerCase()
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const storagePath = `${profile.org_id}/templates/${newTemplateId}/${file.name}`

      // Upload to Storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (storageError) throw storageError

      // Insert template row
      const { data: newRow, error: insertError } = await supabase
        .from('templates')
        .insert({
          id: newTemplateId,
          org_id: profile.org_id,
          name: baseName,
          source: 'uploaded',
          file_path: storagePath,
          parse_status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Fire-and-forget extraction
      supabase.functions.invoke('template-extract', {
        body: { templateId: newTemplateId },
      })

      await fetchTemplates()
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  async function handleDelete(templateId: string) {
    const template = templates.find(t => t.id === templateId)
    if (!template) return

    // Delete Storage file if exists
    if (template.file_path) {
      await supabase.storage.from('documents').remove([template.file_path])
    }

    // Delete row (cascade deletes template_sections)
    await supabase.from('templates').delete().eq('id', templateId)

    setDeleteConfirmId(null)
    await fetchTemplates()
  }

  const prebuiltTemplates = templates.filter(t => t.source === 'prebuilt')
  const uploadedTemplates = templates.filter(t => t.source === 'uploaded')

  const deleteTarget = deleteConfirmId ? templates.find(t => t.id === deleteConfirmId) : null

  return (
    <div className="space-y-8">

      {/* ── Section A: Upload zone ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Upload a template</h2>
        <p className="text-sm text-gray-500 mb-4">
          DOCX or PDF only. Uploaded templates are private to your organization.
        </p>

        <div
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
            dragOver ? 'border-jamo-300 bg-jamo-50' : 'border-gray-200 hover:border-jamo-200 bg-gray-50'
          }`}
          style={{ minHeight: 120 }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <span className="w-5 h-5 border-2 border-jamo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6">
              <Upload className="w-6 h-6 text-gray-400" />
              <p className="text-sm text-gray-500">
                Drag a file here, or{' '}
                <span className="text-jamo-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-400">DOCX or PDF</p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          onChange={onFileInputChange}
        />
      </div>

      {/* ── Section B + C: Template list with disclosure ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">All templates</h2>

        {loading ? (
          <p className="text-sm text-gray-400 italic">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No templates uploaded yet. Upload a DOCX or PDF to use your organization's format.
          </p>
        ) : (
          <div>
            {/* Pre-built templates */}
            {prebuiltTemplates.map(template => (
              <TemplateRow
                key={template.id}
                template={template}
                onDeleteClick={() => setDeleteConfirmId(template.id)}
              />
            ))}

            {/* Separator + org templates */}
            {uploadedTemplates.length > 0 && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-xs text-gray-400">
                      Your organization's templates
                    </span>
                  </div>
                </div>

                {uploadedTemplates.map(template => (
                  <TemplateRow
                    key={template.id}
                    template={template}
                    onDeleteClick={() => setDeleteConfirmId(template.id)}
                  />
                ))}
              </>
            )}

            {uploadedTemplates.length === 0 && prebuiltTemplates.length > 0 && (
              <p className="text-sm text-gray-500 italic mt-4">
                No templates uploaded yet. Upload a DOCX or PDF to use your organization's format.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Delete confirmation dialog ── */}
      {deleteConfirmId && deleteTarget && (
        <DeleteDialog
          templateName={deleteTarget.name}
          onConfirm={() => handleDelete(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  )
}

// ── Template row (extracted for readability) ──────────────────────────────────

function TemplateRow({
  template,
  onDeleteClick,
}: {
  template: Template
  onDeleteClick: () => void
}) {
  const isUploadedSource = template.source === 'uploaded'

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="flex items-center justify-between py-3">
        {/* Left: name + description */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{template.name}</p>
            {isUploadedSource ? (
              <span className="text-xs font-normal text-jamo-600 bg-jamo-50 px-2 py-0.5 rounded-full shrink-0">
                Your template
              </span>
            ) : (
              <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                Pre-built
              </span>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          )}
        </div>

        {/* Right: status + delete */}
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <StatusIndicator status={template.parse_status} />

          {isUploadedSource && (
            <button
              type="button"
              onClick={onDeleteClick}
              aria-label={`Delete ${template.name}`}
              className="flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors"
              style={{ width: 44, height: 44 }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Section C: collapsible disclosure */}
      {template.parse_status === 'ready' && (
        <div className="pb-3">
          <SectionDisclosure templateId={template.id} lowConfidence={template.low_confidence} />
        </div>
      )}
    </div>
  )
}
