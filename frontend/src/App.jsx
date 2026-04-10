import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Users, BarChart3, Sparkles, Trash2, ArrowLeft, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react';

// ─── Avatar color palette ────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #3b82f6, #06b6d4)',
  'linear-gradient(135deg, #10b981, #14b8a6)',
  'linear-gradient(135deg, #f59e0b, #f97316)',
  'linear-gradient(135deg, #ef4444, #ec4899)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #14b8a6, #22c55e)',
];

function getInitials(name) {
  if (!name || name === 'null') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileTypeIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  return 'img';
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState('table');
  const [expandedCard, setExpandedCard] = useState(null);
  const fileInputRef = useRef(null);

  const API_URL = 'http://localhost:8000';

  // ─── File handling ───────────────────────────────────────────────────────
  const addFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles);
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const unique = fileArray.filter((f) => !existingNames.has(f.name));
      return [...prev, ...unique];
    });
    setError(null);
    setResults(null);
  }, []);

  const removeFile = useCallback((index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setResults(null);
    setError(null);
  }, []);

  // ─── Drag & Drop ─────────────────────────────────────────────────────────
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleFileInput = useCallback(
    (e) => {
      if (e.target.files?.length) {
        addFiles(e.target.files);
        e.target.value = '';
      }
    },
    [addFiles]
  );

  // ─── Submit for comparison ───────────────────────────────────────────────
  const handleCompare = async () => {
    if (files.length < 2) {
      setError('Please upload at least 2 resumes to compare.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setProgress(0);

    // Fake progress animation
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return p + Math.random() * 15;
      });
    }, 800);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await fetch(`${API_URL}/compare`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Server error');
      }

      clearInterval(progressInterval);
      setProgress(100);

      setTimeout(() => {
        setResults(data);
        setLoading(false);
      }, 500);
    } catch (err) {
      clearInterval(progressInterval);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleNewComparison = () => {
    setFiles([]);
    setResults(null);
    setError(null);
    setActiveTab('table');
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Background decoration */}
      <div className="bg-decoration">
        <div className="bg-orb bg-orb--1" />
        <div className="bg-orb bg-orb--2" />
        <div className="bg-orb bg-orb--3" />
      </div>

      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="header-logo">ST</div>
            <div>
              <div className="header-title">Smart Talent Selection</div>
              <div className="header-subtitle">AI-Powered HR Analytics</div>
            </div>
          </div>
          <div className="header-status">
            <span className="status-dot" />
            AI Engine Active
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Processing overlay */}
        {loading && (
          <div className="processing-overlay">
            <div className="processing-card">
              <div className="processing-spinner" />
              <h2>Analyzing Resumes</h2>
              <p>
                Our AI is extracting and comparing skills, experience, and qualifications from{' '}
                {files.length} resumes...
              </p>
              <div className="processing-progress">
                <div
                  className="processing-progress-bar"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Results View ── */}
        {results ? (
          <ResultsView
            results={results}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            expandedCard={expandedCard}
            setExpandedCard={setExpandedCard}
            onNewComparison={handleNewComparison}
          />
        ) : (
          /* ── Upload View ── */
          <div className="upload-section">
            <div className="section-header">
              <h1>Compare Candidates</h1>
              <p>
                Upload multiple resumes to get an AI‑powered side‑by‑side comparison of skills,
                experience, and qualifications.
              </p>
            </div>

            {/* Drop zone */}
            <div
              className={`drop-zone ${dragActive ? 'drop-zone--active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              id="dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                onChange={handleFileInput}
                className="file-input-hidden"
                style={{ display: 'none' }}
                id="file-input"
              />
              <div className="drop-zone-content">
                <div className="drop-zone-icon">
                  <Upload size={28} />
                </div>
                <h3>Drop resumes here</h3>
                <p>
                  or <span className="browse-link">browse files</span> from your computer
                </p>
                <p style={{ marginTop: '0.5rem' }}>
                  Supports PDF, DOCX, DOC, PNG, JPG &bull; Up to 10MB each &bull; Max 20 files
                </p>
              </div>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <>
                <div className="file-list">
                  {files.map((file, idx) => (
                    <FileItem
                      key={file.name + idx}
                      file={file}
                      onRemove={() => removeFile(idx)}
                    />
                  ))}
                </div>

                <div className="actions-bar">
                  <div className="file-count">
                    <strong>{files.length}</strong> resume{files.length !== 1 ? 's' : ''} selected
                    {files.length < 2 && (
                      <span style={{ color: 'var(--accent-warning)', marginLeft: '0.5rem' }}>
                        — add at least {2 - files.length} more
                      </span>
                    )}
                  </div>
                  <div className="actions-buttons">
                    <button className="btn btn--ghost" onClick={clearFiles} id="clear-all-btn">
                      <Trash2 size={16} />
                      Clear All
                    </button>
                    <button
                      className="btn btn--primary"
                      onClick={handleCompare}
                      disabled={files.length < 2 || loading}
                      id="compare-btn"
                    >
                      <Sparkles size={16} />
                      Compare with AI
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && <div className="error-box">{error}</div>}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── File Item Component ─────────────────────────────────────────────────────
function FileItem({ file, onRemove }) {
  const type = getFileTypeIcon(file.name);
  return (
    <div className="file-item">
      <div className="file-item-info">
        <div className={`file-item-icon file-item-icon--${type}`}>{type}</div>
        <div>
          <div className="file-item-name">{file.name}</div>
          <div className="file-item-size">{formatFileSize(file.size)}</div>
        </div>
      </div>
      <button className="file-item-remove" onClick={onRemove} aria-label="Remove file">
        <X size={18} />
      </button>
    </div>
  );
}

// ─── Results View ────────────────────────────────────────────────────────────
function ResultsView({ results, activeTab, setActiveTab, expandedCard, setExpandedCard, onNewComparison }) {
  const { candidates, errors, all_skills } = results;

  // Compute stats
  const totalSkills = all_skills?.length || 0;
  const avgExperience =
    candidates.reduce((sum, c) => sum + (c.total_experience_years || 0), 0) / candidates.length;
  const maxExperience = Math.max(...candidates.map((c) => c.total_experience_years || 0));

  return (
    <div className="results-section">
      {/* Header */}
      <div className="results-header">
        <h2>Candidate Comparison</h2>
        <div className="results-actions">
          <button className="btn btn--ghost" onClick={onNewComparison} id="new-comparison-btn">
            <ArrowLeft size={16} />
            New Comparison
          </button>
        </div>
      </div>

      {/* Error banner */}
      {errors?.length > 0 && (
        <div className="errors-banner">
          <h4>⚠ Some files could not be processed</h4>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>
                <strong>{e.filename}</strong> — {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats */}
      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-card-label">Candidates</div>
          <div className="stat-card-value">{candidates.length}</div>
          <div className="stat-card-sub">Resumes analysed</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Unique Skills</div>
          <div className="stat-card-value">{totalSkills}</div>
          <div className="stat-card-sub">Across all candidates</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg. Experience</div>
          <div className="stat-card-value">{avgExperience.toFixed(1)}</div>
          <div className="stat-card-sub">Years average</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Most Experienced</div>
          <div className="stat-card-value">{maxExperience}</div>
          <div className="stat-card-sub">Years maximum</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'table' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('table')}
          id="tab-table"
        >
          <Users size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          Overview Table
        </button>
        <button
          className={`tab-btn ${activeTab === 'skills' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('skills')}
          id="tab-skills"
        >
          <BarChart3 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          Skill Matrix
        </button>
        <button
          className={`tab-btn ${activeTab === 'cards' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('cards')}
          id="tab-cards"
        >
          <FileText size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          Detailed Profiles
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'table' && <ComparisonTable candidates={candidates} />}
      {activeTab === 'skills' && <SkillMatrix candidates={candidates} allSkills={all_skills} />}
      {activeTab === 'cards' && (
        <DetailCards
          candidates={candidates}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
        />
      )}
    </div>
  );
}

// ─── Comparison Table ────────────────────────────────────────────────────────
function ComparisonTable({ candidates }) {
  return (
    <div className="table-container">
      <div className="table-title-bar">
        <h3>
          <Users size={18} />
          Candidate Overview
        </h3>
      </div>
      <div className="table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Location</th>
              <th>Experience</th>
              <th>Key Skills</th>
              <th>Education</th>
              <th>Strengths</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, idx) => (
              <tr key={idx}>
                <td>
                  <div className="candidate-name-cell">
                    <div
                      className="candidate-avatar"
                      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
                    >
                      {getInitials(c.name)}
                    </div>
                    <div>
                      <div className="candidate-name">{c.name || 'Unknown'}</div>
                      <div className="candidate-email">{c.email || c._filename}</div>
                    </div>
                  </div>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{c.location || '—'}</td>
                <td>
                  <span className="exp-badge">
                    {c.total_experience_years != null ? `${c.total_experience_years} yrs` : '—'}
                  </span>
                </td>
                <td>
                  <div className="skill-tags">
                    {(c.skills || []).slice(0, 5).map((s, i) => (
                      <span className="skill-tag" key={i}>
                        {s}
                      </span>
                    ))}
                    {(c.skills || []).length > 5 && (
                      <span className="skill-tag" style={{ opacity: 0.6 }}>
                        +{c.skills.length - 5}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {c.education && c.education.length > 0
                    ? c.education.map((e) => e.degree || e.institution).join(', ')
                    : '—'}
                </td>
                <td>
                  <div className="skill-tags">
                    {(c.strengths || []).slice(0, 3).map((s, i) => (
                      <span className="skill-tag skill-tag--match" key={i}>
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Skill Matrix ────────────────────────────────────────────────────────────
function SkillMatrix({ candidates, allSkills }) {
  if (!allSkills || allSkills.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <h3>No skills data available</h3>
        <p>Skills could not be extracted from the resumes.</p>
      </div>
    );
  }

  // Build a lookup: candidate index -> set of lowercase skills
  const candidateSkillSets = candidates.map(
    (c) => new Set((c.skills || []).map((s) => s.trim().toLowerCase()))
  );

  return (
    <div className="table-container skill-matrix-container">
      <div className="table-title-bar">
        <h3>
          <BarChart3 size={18} />
          Skill Comparison Matrix
        </h3>
      </div>
      <div className="table-scroll">
        <table className="skill-matrix-table">
          <thead>
            <tr>
              <th>Skill</th>
              {candidates.map((c, i) => (
                <th key={i}>{c.name || c._filename}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSkills.map((skill) => (
              <tr key={skill}>
                <td>{skill}</td>
                {candidateSkillSets.map((skillSet, i) => (
                  <td key={i}>
                    {skillSet.has(skill) ? (
                      <span className="skill-check">
                        <CheckCircle size={16} />
                      </span>
                    ) : (
                      <span className="skill-miss">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detail Cards ────────────────────────────────────────────────────────────
function DetailCards({ candidates, expandedCard, setExpandedCard }) {
  return (
    <div className="detail-section">
      <div className="candidate-cards">
        {candidates.map((c, idx) => (
          <CandidateCard
            key={idx}
            candidate={c}
            index={idx}
            isExpanded={expandedCard === idx}
            onToggle={() => setExpandedCard(expandedCard === idx ? null : idx)}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({ candidate: c, index, isExpanded, onToggle }) {
  return (
    <div className="candidate-card">
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div
          className="card-avatar"
          style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
        >
          {getInitials(c.name)}
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-name">{c.name || 'Unknown Candidate'}</div>
          <div className="card-meta">
            {[c.email, c.phone, c.location].filter(Boolean).join(' · ') || c._filename}
          </div>
        </div>
        {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
      </div>

      <div className="card-body">
        {/* Summary always visible */}
        <div className="card-field">
          <span className="card-field-label">Professional Summary</span>
          <span className="card-field-value">{c.professional_summary || '—'}</span>
        </div>

        <div className="card-field">
          <span className="card-field-label">Skills</span>
          <div className="skill-tags" style={{ marginTop: 4 }}>
            {(c.skills || []).map((s, i) => (
              <span className="skill-tag" key={i}>
                {s}
              </span>
            ))}
            {(!c.skills || c.skills.length === 0) && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
            )}
          </div>
        </div>

        <div className="card-field">
          <span className="card-field-label">Total Experience</span>
          <span className="exp-badge" style={{ width: 'fit-content' }}>
            {c.total_experience_years != null ? `${c.total_experience_years} years` : '—'}
          </span>
        </div>

        {isExpanded && (
          <>
            {/* Experience */}
            {c.experience && c.experience.length > 0 && (
              <div className="card-field">
                <span className="card-field-label">Work Experience</span>
                <ul className="card-field-list">
                  {c.experience.map((exp, i) => (
                    <li key={i}>
                      <strong>{exp.role}</strong> at {exp.company}
                      <br />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {exp.duration} — {exp.highlights}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Education */}
            {c.education && c.education.length > 0 && (
              <div className="card-field">
                <span className="card-field-label">Education</span>
                <ul className="card-field-list">
                  {c.education.map((edu, i) => (
                    <li key={i}>
                      <strong>{edu.degree}</strong> — {edu.institution}
                      {edu.year && ` (${edu.year})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Certifications */}
            {c.certifications && c.certifications.length > 0 && (
              <div className="card-field">
                <span className="card-field-label">Certifications</span>
                <div className="skill-tags" style={{ marginTop: 4 }}>
                  {c.certifications.map((cert, i) => (
                    <span className="skill-tag skill-tag--match" key={i}>
                      {cert}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            {c.projects && c.projects.length > 0 && (
              <div className="card-field">
                <span className="card-field-label">Projects</span>
                <ul className="card-field-list">
                  {c.projects.map((proj, i) => (
                    <li key={i}>{proj}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Strengths & Gaps */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="card-field">
                <span className="card-field-label">Strengths</span>
                <ul className="card-field-list">
                  {(c.strengths || []).map((s, i) => (
                    <li key={i} style={{ color: 'var(--accent-success)' }}>
                      ✓ {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card-field">
                <span className="card-field-label">Gaps</span>
                <ul className="card-field-list">
                  {(c.gaps || []).map((g, i) => (
                    <li key={i} style={{ color: 'var(--accent-warning)' }}>
                      ⚠ {g}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
