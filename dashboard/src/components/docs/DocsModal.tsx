'use client';

import { useState, useEffect } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { fetchAPI } from '@/lib/api';
import type { Doc } from '@/lib/types';
import { Modal, Button } from '@/components/ui';
import { FileText, Trash2, Edit, Save, X } from 'lucide-react';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
}

export function DocsModal({ isOpen, onClose, workspaceId = 'default' }: DocsModalProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [docContent, setDocContent] = useState('');
  const [editingDoc, setEditingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDocs();
    }
  }, [isOpen, workspaceId]);

  async function loadDocs() {
    const data = await fetchAPI(`/api/docs?workspace=${workspaceId}`);
    setDocs(data?.docs || []);
  }

  async function loadDocContent(doc: Doc) {
    setSelectedDoc(doc);
    const data = await fetchAPI(`/api/docs/${doc.workspace_id}/${doc.filename}`);
    setDocContent(data?.doc?.content || '');
    setEditingDoc(false);
  }

  async function saveDoc() {
    if (!selectedDoc) return;
    await fetchAPI(`/api/docs/${selectedDoc.workspace_id}/${selectedDoc.filename}`, {
      method: 'POST',
      body: JSON.stringify({ content: docContent }),
    });
    setEditingDoc(false);
    loadDocs();
  }

  async function createDoc() {
    if (!newDocName.trim()) return;
    const filename = newDocName.endsWith('.md') ? newDocName : `${newDocName}.md`;
    await fetchAPI(`/api/docs/${workspaceId}/${filename}`, {
      method: 'POST',
      body: JSON.stringify({ content: `# ${newDocName.replace('.md', '')}\n\n` }),
    });
    setNewDocName('');
    loadDocs();
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Delete ${doc.filename}?`)) return;
    await fetchAPI(`/api/docs/${doc.workspace_id}/${doc.filename}`, { method: 'DELETE' });
    if (selectedDoc?.id === doc.id) {
      setSelectedDoc(null);
      setDocContent('');
    }
    loadDocs();
  }

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center p-4',
      !isOpen && 'hidden'
    )}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-4xl h-[80vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-zinc-400" />
            <h3 className="text-lg font-semibold text-zinc-100">Docs</h3>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Doc List Sidebar */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800 flex flex-col max-h-[30vh] md:max-h-none">
            <div className="p-3 border-b border-zinc-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="new-doc-name"
                  value={newDocName}
                  onChange={e => setNewDocName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createDoc()}
                  className="flex-1 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:border-blue-500 outline-none placeholder-zinc-500"
                />
                <Button size="sm" onClick={createDoc}>+</Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {docs.length === 0 ? (
                <p className="text-sm text-zinc-500 p-2 text-center">No docs yet</p>
              ) : (
                docs.map(doc => (
                  <div
                    key={doc.id}
                    className={cn(
                      'flex items-center justify-between p-2 rounded cursor-pointer group transition-colors',
                      selectedDoc?.id === doc.id
                        ? 'bg-blue-500/20 border border-blue-500/30'
                        : 'hover:bg-zinc-800 border border-transparent'
                    )}
                  >
                    <div className="flex-1 min-w-0" onClick={() => loadDocContent(doc)}>
                      <div className="text-sm font-medium text-zinc-200 truncate">{doc.filename}</div>
                      <div className="text-xs text-zinc-500">{formatRelativeTime(doc.updated_at)}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteDoc(doc); }}
                      className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Doc Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedDoc ? (
              <>
                <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800 bg-zinc-800/30">
                  <div>
                    <span className="font-medium text-zinc-200">{selectedDoc.filename}</span>
                    {selectedDoc.updated_by_name && (
                      <span className="text-xs text-zinc-500 ml-2">
                        Last edited by {selectedDoc.updated_by_name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editingDoc ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditingDoc(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={saveDoc}>
                          <Save className="h-4 w-4" />
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setEditingDoc(true)}>
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {editingDoc ? (
                    <textarea
                      value={docContent}
                      onChange={e => setDocContent(e.target.value)}
                      className="w-full h-full bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg p-4 font-mono text-sm resize-none focus:border-blue-500 outline-none"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-300 leading-relaxed">
                      {docContent || 'Empty document'}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-500">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
                  <p>Select a doc to view</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
