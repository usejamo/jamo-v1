import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import proposals from '../data/proposals.json'
import type { Proposal, ProposalStatus } from '../types/proposal'

const allProposals = proposals as Proposal[]

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
}

const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  in_review: 'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-600',
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const MOCK_DRAFT = `1. Executive Summary

This proposal outlines our approach to conducting the study on behalf of [Client]. Our team brings extensive experience in [Therapeutic Area] trials, with dedicated project management, biostatistics, and regulatory affairs support.

2. Study Objectives

Primary Objective: To evaluate the safety, tolerability, and pharmacokinetics of [Compound] in the target population.

Secondary Objectives:
- Assess preliminary efficacy signals across defined endpoints
- Characterize the PK/PD relationship
- Evaluate biomarker responses throughout the study period

3. Scope of Work

Our full-service offering includes:
- Protocol development and regulatory submission support
- Site identification, qualification, and management
- Patient recruitment and retention strategies
- Data management, biostatistics, and clinical reporting
- Medical monitoring and safety reporting

4. Timeline

Estimated study duration: 18–24 months from contract execution to final study report.

5. Budget Overview

The total proposed budget is detailed in the accompanying cost breakdown. All costs are inclusive of pass-through expenses and site management fees.`

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  const proposal = allProposals.find(p => p.id === id)

  if (!proposal) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Proposal not found.</p>
        <button onClick={() => navigate('/proposals')} className="mt-4 text-jamo-500 hover:underline text-sm">
          Back to proposals
        </button>
      </div>
    )
  }

  function handleGenerate() {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
    }, 2200)
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/proposals')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Proposals
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[proposal.status]}`}>
                {STATUS_LABELS[proposal.status]}
              </span>
              <span className="text-xs text-gray-400">{proposal.id.toUpperCase()}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{proposal.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{proposal.client} · {proposal.studyType}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(proposal.value)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Proposal value</p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Therapeutic Area</p>
            <p className="text-sm text-gray-800 mt-1">{proposal.therapeuticArea}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Due Date</p>
            <p className="text-sm text-gray-800 mt-1">{formatDate(proposal.dueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Created</p>
            <p className="text-sm text-gray-800 mt-1">{formatDate(proposal.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* AI Generation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">AI-Generated Proposal Draft</h2>
            <p className="text-xs text-gray-500 mt-0.5">Based on RFP context and your template</p>
          </div>
          {!generated && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 bg-jamo-500 hover:bg-jamo-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {generating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  Generate with AI
                </>
              )}
            </button>
          )}
          {generated && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Generated
              </span>
              <button className="text-sm text-jamo-500 hover:text-jamo-600 font-medium border border-jamo-200 px-3 py-1.5 rounded-lg transition-colors">
                Export to Word
              </button>
            </div>
          )}
        </div>

        {!generated && !generating && (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p className="text-sm text-gray-400">Click "Generate with AI" to draft this proposal</p>
          </div>
        )}

        {generating && (
          <div className="border border-gray-100 rounded-lg p-8 text-center">
            <svg className="w-8 h-8 text-jamo-400 mx-auto mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-gray-500">Analyzing RFP context and drafting proposal…</p>
          </div>
        )}

        {generated && (
          <div className="border border-gray-100 rounded-lg p-6 bg-gray-50 font-mono text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {MOCK_DRAFT}
          </div>
        )}
      </div>
    </div>
  )
}
