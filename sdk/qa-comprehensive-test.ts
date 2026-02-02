/**
 * QA Comprehensive Test Suite for @quantacodes/mc-sdk
 * Tests: MCClient, Tasks, Messages, Triggers, Notifications, Agents
 * Error handling, TypeScript types, API coverage
 */

import { 
  MCClient,
  MCError,
  MCNotFoundError,
  MCUnauthorizedError,
  MCValidationError,
  type Task,
  type Agent,
  type Message,
  type Notification,
  type Trigger,
  type TaskStatus,
  type AgentStatus,
} from './dist/index.mjs';

const API_URL = 'https://mc-v3-api.saurabh-198.workers.dev';
const API_TOKEN = 'mc-v3-token-2026';
const TEST_AGENT_ID = '2e7ed270-8efb-4d';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error, duration: Date.now() - start });
    console.log(`❌ ${name}: ${error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('🔬 QA Comprehensive Test Suite for @quantacodes/mc-sdk\n');
  console.log(`API: ${API_URL}`);
  console.log(`Agent: ${TEST_AGENT_ID}\n`);
  
  // Initialize client
  const mc = new MCClient({
    baseURL: API_URL,
    token: API_TOKEN,
    maxRetries: 2,
    timeoutMs: 15000,
  });

  // ============ MODULE 1: MCClient Core ============
  console.log('\n📦 Module: MCClient Core');
  
  await test('health() - API reachable', async () => {
    const health = await mc.health();
    assert(health.status === 'ok', `Expected status 'ok', got '${health.status}'`);
    assert(typeof health.timestamp === 'string', 'Missing timestamp');
  });

  await test('getStats() - Basic stats', async () => {
    const stats = await mc.getStats();
    assert(typeof stats.agentsActive === 'number', 'Missing agentsActive');
    assert(typeof stats.tasksInQueue === 'number', 'Missing tasksInQueue');
    assert(typeof stats.tasksInProgress === 'number', 'Missing tasksInProgress');
  });

  await test('getFullStats() - Full stats breakdown', async () => {
    const stats = await mc.getFullStats();
    assert(typeof stats.agents === 'number', 'Missing agents count');
    assert(Array.isArray(stats.tasksByStatus), 'Missing tasksByStatus array');
  });

  await test('getTags() - Get all tags', async () => {
    const { tags, colors } = await mc.getTags();
    assert(Array.isArray(tags), 'Tags should be array');
    assert(Array.isArray(colors), 'Colors should be array');
  });

  await test('getActivities() - Activity feed', async () => {
    const activities = await mc.getActivities({ limit: 5 });
    assert(Array.isArray(activities), 'Activities should be array');
    if (activities.length > 0) {
      assert(typeof activities[0].id === 'string', 'Activity missing id');
      assert(typeof activities[0].type === 'string', 'Activity missing type');
    }
  });

  // ============ MODULE 2: Tasks ============
  console.log('\n📋 Module: Tasks');

  let testTaskId: string | null = null;

  await test('tasks.list() - List tasks', async () => {
    const tasks = await mc.tasks.list();
    assert(Array.isArray(tasks), 'Tasks should be array');
  });

  await test('tasks.list({ status }) - Filter by status', async () => {
    const tasks = await mc.tasks.list({ status: 'inbox' });
    assert(Array.isArray(tasks), 'Filtered tasks should be array');
    tasks.forEach(t => {
      assert(t.status === 'inbox', `Expected status 'inbox', got '${t.status}'`);
    });
  });

  await test('tasks.create() - Create new task', async () => {
    testTaskId = await mc.tasks.create({
      title: `QA Test Task - ${Date.now()}`,
      description: 'Created by SDK QA test suite',
      priority: 'normal',
    });
    assert(typeof testTaskId === 'string', 'Create should return task ID');
    assert(testTaskId.length > 0, 'Task ID should not be empty');
  });

  await test('tasks.get() - Get task with details', async () => {
    if (!testTaskId) throw new Error('No test task created');
    const { task, messages } = await mc.tasks.get(testTaskId);
    assert(task.id === testTaskId, 'Task ID mismatch');
    assert(task.title.includes('QA Test Task'), 'Task title mismatch');
    assert(Array.isArray(messages), 'Messages should be array');
    assert(Array.isArray(task.assignees), 'Assignees should be array');
  });

  await test('tasks.update() - Update task', async () => {
    if (!testTaskId) throw new Error('No test task created');
    await mc.tasks.update(testTaskId, {
      description: 'Updated by QA test',
      priority: 'high',
    });
    const { task } = await mc.tasks.get(testTaskId);
    assert(task.priority === 'high', 'Priority should be updated');
  });

  await test('tasks.changeStatus() - Change task status', async () => {
    if (!testTaskId) throw new Error('No test task created');
    await mc.tasks.changeStatus(testTaskId, 'assigned');
    const { task } = await mc.tasks.get(testTaskId);
    assert(task.status === 'assigned', `Status should be 'assigned', got '${task.status}'`);
  });

  await test('tasks.assign() - Assign agent', async () => {
    if (!testTaskId) throw new Error('No test task created');
    await mc.tasks.assign(testTaskId, { agent_id: TEST_AGENT_ID });
    const { task } = await mc.tasks.get(testTaskId);
    assert(task.assignees.some(a => a.id === TEST_AGENT_ID), 'Agent should be assigned');
  });

  await test('tasks.getDependencies() - Get dependencies', async () => {
    if (!testTaskId) throw new Error('No test task created');
    const deps = await mc.tasks.getDependencies(testTaskId);
    assert(Array.isArray(deps.blockers), 'Blockers should be array');
    assert(Array.isArray(deps.blocking), 'Blocking should be array');
    assert(typeof deps.is_blocked === 'boolean', 'is_blocked should be boolean');
  });

  await test('tasks.getAgentQueue() - Get agent queue', async () => {
    const queue = await mc.tasks.getAgentQueue(TEST_AGENT_ID);
    assert(typeof queue.agent === 'object', 'Should have agent info');
    assert(Array.isArray(queue.queue), 'Queue should be array');
    assert(typeof queue.count === 'number', 'Should have count');
  });

  await test('tasks.unassign() - Unassign agent', async () => {
    if (!testTaskId) throw new Error('No test task created');
    await mc.tasks.unassign(testTaskId, TEST_AGENT_ID);
    const { task } = await mc.tasks.get(testTaskId);
    assert(!task.assignees.some(a => a.id === TEST_AGENT_ID), 'Agent should be unassigned');
  });

  // ============ MODULE 3: Messages ============
  console.log('\n💬 Module: Messages');

  let testMessageId: string | null = null;

  await test('messages.send() - Post message', async () => {
    if (!testTaskId) throw new Error('No test task created');
    testMessageId = await mc.messages.send(
      testTaskId,
      TEST_AGENT_ID,
      'QA Test message from SDK'
    );
    assert(typeof testMessageId === 'string', 'Should return message ID');
  });

  await test('messages.list() - List task messages', async () => {
    if (!testTaskId) throw new Error('No test task created');
    const messages = await mc.messages.list(testTaskId);
    assert(Array.isArray(messages), 'Messages should be array');
    assert(messages.length > 0, 'Should have at least 1 message');
    const found = messages.find(m => m.id === testMessageId);
    assert(found !== undefined, 'Test message should exist');
  });

  await test('messages.postStatusUpdate() - Status update', async () => {
    if (!testTaskId) throw new Error('No test task created');
    const msgId = await mc.messages.postStatusUpdate(
      testTaskId,
      TEST_AGENT_ID,
      'Testing SDK',
      'Running comprehensive QA'
    );
    assert(typeof msgId === 'string', 'Should return message ID');
  });

  await test('messages.mention() - Message with mentions', async () => {
    if (!testTaskId) throw new Error('No test task created');
    const msgId = await mc.messages.mention(
      testTaskId,
      TEST_AGENT_ID,
      'Testing mention functionality',
      ['Backend-Tech-Lead']
    );
    assert(typeof msgId === 'string', 'Should return message ID');
  });

  // ============ MODULE 4: Agents ============
  console.log('\n🤖 Module: Agents');

  await test('agents.list() - List all agents', async () => {
    const agents = await mc.agents.list();
    assert(Array.isArray(agents), 'Agents should be array');
    assert(agents.length > 0, 'Should have agents');
    assert(agents[0].id !== undefined, 'Agent should have id');
    assert(agents[0].name !== undefined, 'Agent should have name');
  });

  await test('agents.get() - Get agent by ID', async () => {
    const agent = await mc.agents.get(TEST_AGENT_ID);
    assert(agent.id === TEST_AGENT_ID, 'Agent ID mismatch');
    assert(typeof agent.name === 'string', 'Agent should have name');
    assert(typeof agent.role === 'string', 'Agent should have role');
    assert(typeof agent.status === 'string', 'Agent should have status');
  });

  await test('agents.findByName() - Find agent by name', async () => {
    const agent = await mc.agents.findByName('QA-Tester-2');
    assert(agent !== undefined, 'Should find agent');
    assert(agent!.id === TEST_AGENT_ID, 'Should match test agent');
  });

  await test('agents.listActive() - List active agents', async () => {
    const agents = await mc.agents.listActive();
    assert(Array.isArray(agents), 'Should be array');
    agents.forEach(a => {
      assert(a.status === 'active', 'All should be active');
    });
  });

  // ============ MODULE 5: Notifications ============
  console.log('\n🔔 Module: Notifications');

  await test('notifications.list() - List notifications', async () => {
    const notifications = await mc.notifications.list(TEST_AGENT_ID);
    assert(Array.isArray(notifications), 'Should be array');
    if (notifications.length > 0) {
      assert(typeof notifications[0].id === 'string', 'Should have id');
      assert(typeof notifications[0].content === 'string', 'Should have content');
    }
  });

  await test('notifications.listUnread() - Get unread', async () => {
    const unread = await mc.notifications.listUnread(TEST_AGENT_ID);
    assert(Array.isArray(unread), 'Should be array');
  });

  await test('notifications.getUnreadCount() - Count unread', async () => {
    const count = await mc.notifications.getUnreadCount(TEST_AGENT_ID);
    assert(typeof count === 'number', 'Should return number');
    assert(count >= 0, 'Count should be >= 0');
  });

  await test('notifications.getSubscriptions() - Get subscriptions', async () => {
    const subs = await mc.notifications.getSubscriptions(TEST_AGENT_ID);
    assert(Array.isArray(subs), 'Should be array');
  });

  await test('notifications.filterByType() - Filter helper', async () => {
    const notifications = await mc.notifications.list(TEST_AGENT_ID);
    const mentions = mc.notifications.filterByType(notifications, 'mention');
    assert(Array.isArray(mentions), 'Should return array');
  });

  await test('notifications.groupByTask() - Group helper', async () => {
    const notifications = await mc.notifications.list(TEST_AGENT_ID);
    const grouped = mc.notifications.groupByTask(notifications);
    assert(grouped instanceof Map, 'Should return Map');
  });

  // ============ MODULE 6: Triggers ============
  console.log('\n⚡ Module: Triggers');

  await test('triggers.list() - List triggers', async () => {
    const triggers = await mc.triggers.list({ limit: 10 });
    assert(Array.isArray(triggers), 'Should be array');
    if (triggers.length > 0) {
      assert(typeof triggers[0].id === 'string', 'Should have id');
      assert(typeof triggers[0].event_type === 'string', 'Should have event_type');
    }
  });

  await test('triggers.poll() - Poll for triggers', async () => {
    const result = await mc.triggers.poll({ limit: 1 });
    assert('triggers' in result, 'Should have triggers');
    assert('claimed' in result, 'Should have claimed count');
    assert(Array.isArray(result.triggers), 'triggers should be array');
  });

  await test('triggers.parseContext() - Parse context helper', async () => {
    const trigger = { id: '1', context: '{"test": true}' } as Trigger;
    const parsed = mc.triggers.parseContext<{ test: boolean }>(trigger);
    assert(parsed !== null, 'Should parse valid JSON');
    assert(parsed!.test === true, 'Should have correct value');

    const empty = mc.triggers.parseContext({ id: '2' } as Trigger);
    assert(empty === null, 'Should return null for missing context');
  });

  // ============ ERROR HANDLING ============
  console.log('\n🚨 Error Handling');

  await test('MCNotFoundError on invalid task', async () => {
    try {
      await mc.tasks.get('nonexistent-task-id-12345');
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof MCNotFoundError, `Expected MCNotFoundError, got ${err.constructor.name}`);
      assert(err.status === 404, 'Status should be 404');
    }
  });

  await test('MCNotFoundError on invalid agent', async () => {
    try {
      await mc.agents.get('nonexistent-agent-id-12345');
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof MCNotFoundError, `Expected MCNotFoundError, got ${err.constructor.name}`);
    }
  });

  await test('MCUnauthorizedError on invalid token', async () => {
    const badClient = new MCClient({
      baseURL: API_URL,
      token: 'invalid-token-xyz',
      maxRetries: 0,
    });
    try {
      // Use an authenticated endpoint (health() is public, tasks.list() requires auth)
      await badClient.tasks.list();
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof MCUnauthorizedError, `Expected MCUnauthorizedError, got ${err.constructor.name}`);
      assert(err.status === 401, 'Status should be 401');
    }
  });

  await test('reject() requires feedback', async () => {
    if (!testTaskId) throw new Error('No test task');
    try {
      await mc.tasks.reject(testTaskId, { agent_id: TEST_AGENT_ID });
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err instanceof Error, 'Should throw error');
      assert(err.message.includes('Feedback is required'), 'Should require feedback');
    }
  });

  // ============ CLEANUP ============
  console.log('\n🧹 Cleanup');

  await test('tasks.delete() - Delete test task', async () => {
    if (!testTaskId) throw new Error('No test task created');
    await mc.tasks.delete(testTaskId);
    try {
      await mc.tasks.get(testTaskId);
      throw new Error('Task should be deleted');
    } catch (err) {
      assert(err instanceof MCNotFoundError, 'Should throw NotFound after delete');
    }
  });

  // ============ TYPE VERIFICATION ============
  console.log('\n📝 TypeScript Type Verification');
  
  await test('Type inference works correctly', async () => {
    // These should all compile without errors
    const tasks: Task[] = await mc.tasks.list();
    const agents: Agent[] = await mc.agents.list();
    
    // Status types
    const status: TaskStatus = 'in_progress';
    const agentStatus: AgentStatus = 'active';
    
    // Config accepts all options
    const _client = new MCClient({
      baseURL: 'https://test.com',
      token: 'test',
      maxRetries: 5,
      retryDelayMs: 500,
      timeoutMs: 10000,
    });
    
    assert(true, 'Types compile correctly');
  });

  // ============ SUMMARY ============
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalDuration}ms`);
  console.log(`📈 Pass rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  return { passed, failed, results };
}

// Run tests
runTests()
  .then(({ passed, failed }) => {
    if (failed > 0) {
      console.log('\n🔴 [QA FAIL] - Some tests failed');
      process.exit(1);
    } else {
      console.log('\n🟢 [QA PASS] - All tests passed');
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('\n💥 Test suite crashed:', err);
    process.exit(1);
  });
