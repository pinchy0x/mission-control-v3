'use client';

import { AgentGrid } from '@/components/agents';

export default function AgentsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Agents</h1>
        <p className="text-zinc-500 mt-1">All registered agents in Mission Control</p>
      </div>
      <AgentGrid />
    </div>
  );
}
