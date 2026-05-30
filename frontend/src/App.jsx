import { Fragment, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000'
const EXPORT_COLUMNS = ['id', 'original_file_name', 'status', 'ats_score', 'uploaded_at', 'error_message']

function parseAnalysisJson(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function formatStatus(status) {
  const value = (status || '').toLowerCase()
  if (value.includes('processing') || value.includes('analyzing')) {
    return { text: 'Processing', tone: 'processing', icon: '⏳' }
  }
  if (value === 'completed' || value === 'analyzed') {
    return { text: 'Complete', tone: 'complete', icon: '✓' }
  }
  if (value.includes('failed')) {
    return { text: 'Error', tone: 'error', icon: '!' }
  }
  return { text: status || 'Unknown', tone: 'processing', icon: '•' }
}

function App() {
  const [files, setFiles] = useState([])
  const [resumes, setResumes] = useState([])
  const [loading, setLoading] = useState(false)
  const [helperMessage, setHelperMessage] = useState('')
  const [networkError, setNetworkError] = useState('')
  const [sortBy, setSortBy] = useState('uploaded_at')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedRows, setExpandedRows] = useState({})

  const statusCounts = useMemo(() => {
    return resumes.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})
  }, [resumes])

  async function refreshResumes() {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/resumes`)
      const data = await response.json()
      setResumes(data.items || [])
      setHelperMessage('Resumes refreshed.')
      setNetworkError('')
    } catch {
      setNetworkError('Network error: unable to reach backend.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshResumes()
  }, [])

  async function uploadResumes() {
    if (!files.length) {
      setHelperMessage('Please choose at least one PDF file.')
      return
    }

    const formData = new FormData()
    Array.from(files).forEach((file) => formData.append('files', file))

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/resumes/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Upload failed.')
      }
      setHelperMessage(data.message || 'Upload complete.')
      setNetworkError('')
      setFiles([])
      await refreshResumes()
    } catch (error) {
      setNetworkError(error.message || 'Upload failed.')
    } finally {
      setLoading(false)
    }
  }

  async function runAction(path, successText) {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}${path}`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Request failed.')
      }
      setHelperMessage(data.message || successText)
      setNetworkError('')
      await refreshResumes()
    } catch (error) {
      setNetworkError(error.message || 'Request failed.')
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id) {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleSort(column) {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(column)
    setSortDir('asc')
  }

  const sortedResumes = useMemo(() => {
    const list = [...resumes]
    list.sort((a, b) => {
      const left = a[sortBy]
      const right = b[sortBy]
      if (sortBy === 'uploaded_at') {
        const lt = new Date(left || 0).getTime()
        const rt = new Date(right || 0).getTime()
        return sortDir === 'asc' ? lt - rt : rt - lt
      }
      if (typeof left === 'number' && typeof right === 'number') {
        return sortDir === 'asc' ? left - right : right - left
      }
      return sortDir === 'asc'
        ? String(left ?? '').localeCompare(String(right ?? ''))
        : String(right ?? '').localeCompare(String(left ?? ''))
    })
    return list
  }, [resumes, sortBy, sortDir])

  function getSortArrow(column) {
    if (sortBy !== column) return '↕'
    return sortDir === 'asc' ? '↑' : '↓'
  }

  function exportCsvLike(type) {
    if (!resumes.length) return
    const rows = [EXPORT_COLUMNS.join(',')]
    resumes.forEach((item) => {
      const row = EXPORT_COLUMNS.map((col) => {
        const raw = item[col] ?? ''
        return `"${String(raw).replaceAll('"', '""')}"`
      }).join(',')
      rows.push(row)
    })

    const text = rows.join('\n')
    const blobType = type === 'excel' ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8;'
    const extension = type === 'excel' ? 'xls' : 'csv'
    const blob = new Blob([text], { type: blobType })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `resume_results.${extension}`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  function exportPdf() {
    if (!resumes.length) return
    window.print()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Smart Talent Selection</h1>
        <button type="button" className="btn secondary" onClick={refreshResumes} disabled={loading}>
          Refresh
        </button>
      </header>

      {networkError ? (
        <section className="network-banner" role="alert">
          <span>{networkError}</span>
          <button type="button" className="close-btn" onClick={() => setNetworkError('')}>
            Dismiss
          </button>
        </section>
      ) : null}

      <section className="controls" aria-busy={loading}>
        <div className="upload-row">
          <label htmlFor="resume-upload" className="btn secondary">
            Browse...
          </label>
          <input
            id="resume-upload"
            className="hidden-input"
            type="file"
            accept=".pdf"
            multiple
            onChange={(event) => setFiles(event.target.files)}
          />
          <span className="file-name">{files?.[0]?.name || 'No file selected'}</span>
          <button type="button" className="btn primary" onClick={uploadResumes} disabled={loading}>
            Upload
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => runAction('/api/resumes/process', 'Processing done.')}
            disabled={loading}
          >
            Process Text
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => runAction('/api/resumes/analyze', 'Analysis done.')}
            disabled={loading}
          >
            Analyze ATS
          </button>
        </div>

        {loading ? <div className="loading">⏳ Working...</div> : null}
      </section>

      <section className="status-row">
        <span>Total: {resumes.length}</span>
        {Object.entries(statusCounts).map(([key, value]) => (
          <span key={key}>
            {key}: {value}
          </span>
        ))}
      </section>

      <p className="message">{helperMessage}</p>

      <section className="table-actions">
        <button type="button" className="btn secondary" disabled={!resumes.length} onClick={() => exportCsvLike('csv')}>
          Export CSV
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={!resumes.length}
          onClick={() => exportCsvLike('excel')}
        >
          Export Excel
        </button>
        <button type="button" className="btn secondary" disabled={!resumes.length} onClick={exportPdf}>
          Export PDF
        </button>
      </section>

      <section className="table-wrap">
        {!resumes.length ? (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <p>Upload resumes to begin</p>
          </div>
        ) : null}
        <table>
          <thead>
            <tr>
              <th>
                <button type="button" className="sort-btn" onClick={() => handleSort('id')}>
                  ID {getSortArrow('id')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-btn" onClick={() => handleSort('original_file_name')}>
                  File {getSortArrow('original_file_name')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-btn" onClick={() => handleSort('status')}>
                  Status {getSortArrow('status')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-btn" onClick={() => handleSort('ats_score')}>
                  ATS Score {getSortArrow('ats_score')}
                </button>
              </th>
              <th>
                <button type="button" className="sort-btn" onClick={() => handleSort('uploaded_at')}>
                  Uploaded {getSortArrow('uploaded_at')}
                </button>
              </th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {sortedResumes.map((resume) => {
              const status = formatStatus(resume.status)
              const analysis = parseAnalysisJson(resume.analysis_json)
              const isExpanded = Boolean(expandedRows[resume.id])
              return (
                <Fragment key={resume.id}>
                  <tr
                    className={isExpanded ? 'selected-row' : ''}
                    onClick={() => toggleExpand(resume.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') toggleExpand(resume.id)
                    }}
                  >
                    <td>{resume.id}</td>
                    <td>{resume.original_file_name}</td>
                    <td>
                      <span className={`status-badge ${status.tone}`}>
                        <span>{status.icon}</span> {status.text}
                      </span>
                    </td>
                    <td>{resume.ats_score ?? '-'}</td>
                    <td>{new Date(resume.uploaded_at).toLocaleString()}</td>
                    <td className="error-cell" title={resume.error_message || ''}>
                      {resume.error_message || '-'}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="details-row" key={`details-${resume.id}`}>
                      <td colSpan={6}>
                        <div className="details-grid">
                          <p>
                            <strong>Has Analysis:</strong> {resume.has_analysis ? 'Yes' : 'No'}
                          </p>
                          <p>
                            <strong>Processed At:</strong>{' '}
                            {resume.processed_at ? new Date(resume.processed_at).toLocaleString() : '-'}
                          </p>
                          <p>
                            <strong>Candidate:</strong> {analysis?.candidate_name || '-'}
                          </p>
                          <p>
                            <strong>Email:</strong> {analysis?.email || '-'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </section>
    </main>
  )
}

export default App
