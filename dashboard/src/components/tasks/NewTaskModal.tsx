'use client';

import { useState } from 'react';
import { Modal, Button } from '@/components/ui';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string, dueDate: string | null, estimate: number | null) => void;
}

export function NewTaskModal({ isOpen, onClose, onCreate }: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate(
      title,
      description,
      dueDate ? new Date(dueDate).toISOString() : null,
      estimate ? parseInt(estimate) : null
    );
    setTitle('');
    setDescription('');
    setDueDate('');
    setEstimate('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Task" size="md">
      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-2">Title</label>
          <input
            type="text"
            placeholder="Task title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:border-blue-500 outline-none placeholder-zinc-500"
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-2">Description</label>
          <textarea
            placeholder="Description..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full h-24 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:border-blue-500 outline-none placeholder-zinc-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-2">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-2">Estimate (minutes)</label>
            <input
              type="number"
              placeholder="e.g. 60"
              value={estimate}
              onChange={e => setEstimate(e.target.value)}
              className="w-full bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:border-blue-500 outline-none placeholder-zinc-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>Create Task</Button>
        </div>
      </div>
    </Modal>
  );
}
