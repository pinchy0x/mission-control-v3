/**
 * QA Integration Test for @quantacodes/mc-sdk
 * Tests against live MC API
 */

import { MCClient, MCNotFoundError, MCValidationError } from './dist/index.mjs';

const API_URL = 'https://mc-v3-api.saurabh-198.workers.dev';
const API_TOKEN = 'mc-v3-token-2026';

const mc = new MCClient({
  baseURL: API_URL,
  token: API_TOKEN,
  maxRetries: 1,
  timeoutMs: 10000,
});

let testTaskId: string | null = null;
const results: { test: string; passed: boolean; error?: string }[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ test: name, passed: true });
    console.log(`✅ ${name}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    results.push({ test: name, passed: false, error });
    console.log(`❌ ${name}: ${error}`);
  }
}

async function runTests() {
  console.log('\n🧪 Starting SDK Integration Tests\n');

  // 1. Health check
  await test('MCClient.health() returns ok', async () => {
    const h = await mc.health();
    if (!h.status) throw new Error('No status returned');
  });

  // 2. Stats
  await test('MCClient.getStats() returns counts', async () => {
    const stats = await mc.getStats();
    if (typeof stats.tasksInProgress !== 'number') throw new Error('Missing tasksInProgress');
  });

  // 3. Tasks list
  await test('TasksModule.list() returns array', async () => {
    const tasks = await mc.tasks.list();
    if (!Array.isArray(tasks)) throw new Error('Not an array');
  });

  // 4. Tasks list with filter
  await test('TasksModule.list({ status }) filters', async () => {
    const tasks = await mc.tasks.list({ status: 'review' });
    if (!Array.isArray(tasks)) throw new Error('Not an array');
  });

  // 5. Get specific task
  await test('TasksModule.get() returns task with messages', async () => {
    const { task, messages } = await mc.tasks.get('65278f1528154aa0');
    if (!task.id) throw new Error('No task.id');
    if (!Array.isArray(messages)) throw new Error('messages not array');
  });

  // 6. Create task
  await test('TasksModule.create() creates task', async () => {
    testTaskId = await mc.tasks.create({
      title: '[QA Test] SDK Integration Test Task',
      description: 'Created by QA-Tester-2 to verify SDK',
      priority: 'low',
    });
    if (!testTaskId) throw new Error('No id returned');
  });

  // 7. Update task
  await test('TasksModule.update() works', async () => {
    if (!testTaskId) throw new Error('No test task');
    await mc.tasks.update(testTaskId, { priority: 'normal' });
  });

  // 8. Messages list
  await test('MessagesModule.list() returns array', async () => {
    const msgs = await mc.messages.list('65278f1528154aa0');
    if (!Array.isArray(msgs)) throw new Error('Not an array');
  });

  // 9. Messages send
  await test('MessagesModule.send() posts message', async () => {
    if (!testTaskId) throw new Error('No test task');
    await mc.messages.send(testTaskId, '2e7ed270-8efb-4d', '[SDK TEST] Message posted via SDK');
  });

  // 10. Notifications check
  await test('NotificationsModule.list() returns array', async () => {
    const notifs = await mc.notifications.list('2e7ed270-8efb-4d');
    if (!Array.isArray(notifs)) throw new Error('Not an array');
  });

  // 11. Triggers poll (for specific agent)
  await test('TriggersModule.poll() works', async () => {
    const result = await mc.triggers.poll('2e7ed270-8efb-4d');
    if (!('triggers' in result)) throw new Error('No triggers key');
  });

  // 12. Agents list
  await test('AgentsModule.list() returns array', async () => {
    const agents = await mc.agents.list();
    if (!Array.isArray(agents)) throw new Error('Not an array');
  });

  // 13. Error handling - 404
  await test('MCNotFoundError thrown for 404', async () => {
    try {
      await mc.tasks.get('nonexistent-task-12345');
      throw new Error('Should have thrown');
    } catch (e) {
      if (!(e instanceof MCNotFoundError)) {
        throw new Error(`Wrong error type: ${e?.constructor?.name}`);
      }
    }
  });

  // 14. Activities
  await test('MCClient.getActivities() returns array', async () => {
    const acts = await mc.getActivities({ limit: 5 });
    if (!Array.isArray(acts)) throw new Error('Not an array');
  });

  // 15. Tags
  await test('MCClient.getTags() returns tags', async () => {
    const { tags } = await mc.getTags();
    if (!Array.isArray(tags)) throw new Error('Not an array');
  });

  // Cleanup
  if (testTaskId) {
    try {
      await mc.tasks.delete(testTaskId);
      console.log('\n🧹 Cleaned up test task');
    } catch (e) {
      console.log('\n⚠️ Could not clean up test task');
    }
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n📊 Results: ${passed}/${results.length} passed`);
  
  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.test}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
