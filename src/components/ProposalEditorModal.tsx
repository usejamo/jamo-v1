import { useState, useEffect } from 'react'
import { useProposalModal } from '../context/ProposalModalContext'
import { useProposals } from '../context/ProposalsContext'
import { useDeleted } from '../context/DeletedContext'
import type { Proposal } from '../types/proposal'

const TA_OPTIONS = ['Oncology', 'Immunology', 'CNS', 'Generics', 'Metabolic', 'Rare Disease']
const PHASE_OPTIONS = ['Phase I', 'Phase II', 'Phase III', 'Phase IV', 'Observational', 'Other']

const INPUT_CLASS =
  'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jamo-200 focus:border-jamo-400 transition-colors'

interface FormState {
  title: string
  client: string
  therapeuticArea: string
  studyType: string
  indication: string
  value: string
  dueDate: string
  description: string
}

function blankForm(): FormState {
  return {
    title: '',
    client: '',
    therapeuticArea: TA_OPTIONS[0],
    studyType: PHASE_OPTIONS[0],
    indication: '',
    value: '',
    dueDate: '',
    description: '',
  }
}

function proposalToForm(p: Proposal): FormState {
  return {
    title: p.title,
    client: p.client,
    therapeuticArea: p.therapeuticArea,
    studyType: p.studyType,
    indication: p.indication ?? '',
    value: String(p.value),
    dueDate: p.dueDate,
    description: p.description ?? '',
  }
}

export default function ProposalEditorModal() {
  const { isOpen, modalProposal, closeModal, showToast } = useProposalModal()
  const { createProposal, updateProposal } = useProposals()
  const { deleteProposal } = useDeleted()

  const isEdit = modalProposal !== undefined
  const [form, setForm] = useState<FormState>(blankForm())
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Sync form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(isEdit ? proposalToForm(modalProposal) : blankForm())
      setDeleteConfirm(false)
    }
  }, [isOpen, isEdit, modalProposal])

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, closeModal])

  if (!isOpen) return null

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    const data = {
      title: form.title,
      client: form.client,
      therapeuticArea: form.therapeuticArea,
      studyType: form.studyType,
      indication: form.indication || undefined,
      value: Number(form.value) || 0,
      dueDate: form.dueDate,
      description: form.description || undefined,
      status: isEdit ? modalProposal.status : ('draft' as const),
    }
    if (isEdit) {
      await updateProposal(modalProposal.id, data)
    } else {
      await createProposal(data)
    }
    closeModal()
  }

  async function handleConfirmDelete() {
    if (!modalProposal) return
    await deleteProposal(modalProposal.id)
    showToast('Proposal moved to Trash')
    closeModal()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={closeModal}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Proposal' : 'New Proposal'}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Project Name — full width */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Name</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Phase II Oncology Study"
            />
          </div>

          {/* 2-col: Sponsor + Therapeutic Area */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sponsor</label>
              <input
                type="text"
                className={INPUT_CLASS}
                value={form.client}
                onChange={e => set('client', e.target.value)}
                placeholder="e.g. AstraZeneca"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Therapeutic Area</label>
              <select
                className={INPUT_CLASS}
                value={form.therapeuticArea}
                onChange={e => set('therapeuticArea', e.target.value)}
              >
                {TA_OPTIONS.map(ta => (
                  <option key={ta} value={ta}>{ta}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 2-col: Trial Phase + Indication */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Trial Phase</label>
              <select
                className={INPUT_CLASS}
                value={form.studyType}
                onChange={e => set('studyType', e.target.value)}
              >
                {PHASE_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Indication</label>
              <input
                type="text"
                className={INPUT_CLASS}
                value={form.indication}
                onChange={e => set('indication', e.target.value)}
                placeholder="e.g. NSCLC"
              />
            </div>
          </div>

          {/* 2-col: Value + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Value ($)</label>
              <input
                type="number"
                className={INPUT_CLASS}
                value={form.value}
                onChange={e => set('value', e.target.value)}
                placeholder="e.g. 500000"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
              <input
                type="date"
                className={INPUT_CLASS}
                value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)}
              />
            </div>
          </div>

          {/* Description — full width */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              className={INPUT_CLASS}
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Brief overview of the proposal..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-100">
          {deleteConfirm ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">Move to Trash? Recoverable for 30 days.</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="inline-flex items-center text-sm font-medium text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center text-sm font-medium text-white bg-red-500 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              {/* Trash icon — edit mode only */}
              <div>
                {isEdit && (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="inline-flex items-center p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                    title="Move to Trash"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  className="inline-flex items-center text-sm font-medium text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="inline-flex items-center text-sm font-medium text-white bg-jamo-500 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
