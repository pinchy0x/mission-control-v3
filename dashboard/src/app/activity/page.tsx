'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/lib/api';
import type { Activity } from '@/lib/types';
import { ActivityFeed } from '@/components/activity';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const data = await fetchAPI('/api/activities?limit=100');
      setActivities(data?.activities || []);
    } catch (e) {
      console.error('Failed to load activities:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Activity</h1>
          <p className="text-zinc-500 mt-1">Recent activity across all agents and tasks</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-4xl mb-4">🦀</div>
            <div className="text-zinc-400">Loading activity...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Activity</h1>
          <p className="text-zinc-500 mt-1">Recent activity across all agents and tasks</p>
        </div>
        <Button variant="secondary" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="max-w-3xl">
        <ActivityFeed activities={activities} />
      </div>
    </div>
  );
}
